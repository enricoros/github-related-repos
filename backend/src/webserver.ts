/**
 * This web server performs analysis requested by any client, and returns the results.
 */
import {createServer, Server} from "http";
import {ClientCommProxyType, ServerConnectionEventsType, SocketApiServer} from "./server/SocketApiServer";
import {GitHubAPI} from "./worker/GitHubAPI";
import {createNoProgress, GitHubAnalyzer} from "./worker/GitHubAnalyzer";
import {err, log, printAppRoutes} from "./server/util";
import {unixTimeNow} from "./worker/Utils";
import {ProgressType, RequestType, ResultType, ServerStatusType} from "../../common/SharedTypes";
import {generateId} from "base64id";

// Module Configuration - API_HOST, API_PORT are overridable by the Environment
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = parseInt(process.env.API_PORT || '1996');
const API_PATH_SIO = '/api/socket';
const API_PATH_CATCH_ALL = '/api/*';
const PUBLIC_DOMAIN = 'www.githubkpis.com';


class Main implements ServerConnectionEventsType {
  public readonly socketApiServer: SocketApiServer;
  private readonly socketSendAll: (messageName: string, payload: any) => any;
  private readonly gitHubAnalyzer: GitHubAnalyzer;

  // server-side state
  private readonly operationsList: ResultType[] = [];
  private readonly serverStatus: ServerStatusType = {
    clientsCount: 0,
    isRunning: false,
    opQueueFull: false,
  }

  constructor(httpServer: Server) {
    this.socketApiServer = new SocketApiServer(API_PATH_SIO, PUBLIC_DOMAIN, httpServer, this as ServerConnectionEventsType);
    this.socketSendAll = this.socketApiServer.sendAll;
    this.gitHubAnalyzer = new GitHubAnalyzer(new GitHubAPI());
  }

  /// Connection/Disconnection Events ///

  clientConnected(socketUid: string, clientComm: ClientCommProxyType): void {
    // receive client messages
    clientComm.onClientMessage('@ghk/op/add', conf => this.queueOperation(conf, socketUid, clientComm));

    // -> client: full status
    this.updateServerStatus({clientsCount: this.serverStatus.clientsCount + 1});
    clientComm.sendToClient('@ghk:ops-list', this.operationsList);
  }

  clientDisconnected(socketUid: string, reason: any): void {
    // -> clients: one disconnected
    this.updateServerStatus({clientsCount: this.serverStatus.clientsCount - 1});
  }

  /// Misc ///

  private pendingOpsCount = () => this.operationsList.filter((op) => !op.progress.done).length;

  /// Client Operations ///

  private queueOperation(conf: RequestType, socketUid: string, clientComm: ClientCommProxyType) {
    if (this.pendingOpsCount() >= 5)
      return clientComm.sendToClient('@ghk:message', 'Cannot add more. Wait for the current queue to clear.')

    // create a new UID
    let uid = null;
    const existingUIDs: string[] = this.operationsList.map(op => op.uid);
    while (uid == null || existingUIDs.includes(uid)) uid = generateId();

    // create the new operation
    const operation: ResultType = {
      uid: uid,
      request: conf,
      progress: createNoProgress(),
      requesterUid: socketUid,
      outputFile: null,
    }

    // prepend to the list
    this.operationsList.unshift(operation);
    this.notifyListChanged();

    // update the queue status (shall implement update-on-change only)
    this.updateServerStatus({opQueueFull: this.pendingOpsCount() >= 5});

    // start the operation if not busy
    if (!this.serverStatus.isRunning)
      this.startNextOperation();
  }

  private startNextOperation() {
    if (this.serverStatus.isRunning)
      return err('startNextOperation: already running something else. FIX THIS');

    // find the next operation to start
    const operation = this.operationsList.slice().reverse().find(op => !op.progress.done && !op.progress.running);
    if (!operation)
      return log(`startNextOperation: no more operations to be started in the queue right now (${this.operationsList.length} total)`);

    // server: notify running
    this.updateServerStatus({isRunning: true});

    // set the operation to a running state
    operation.progress.done = false;
    operation.progress.running = true;
    this.notifyOperationChanged(operation);

    // for finding the time elapsed
    const startTime = unixTimeNow();

    // 4 callbacks invokes asynchronously after the async operation is started
    const onProgress = (progress: ProgressType) => {
      operation.progress = progress;
      this.notifyOperationChanged(operation);
    };
    const onFulfilled = (value: any) => {
      log(`\nAnalysis of '${operation.request.repoFullName}' complete in ${unixTimeNow() - startTime} seconds:`, value);
    };
    const onRejected = (reason: any) => {
      err(`\nERROR: Analysis of '${operation.request.repoFullName}' FAILED after ${unixTimeNow() - startTime} seconds, because:`, reason);
      operation.progress.error = (reason || '<unknown>').toString();
    };
    const andFinally = () => {
      // operation: done & stopped
      operation.progress.done = true;
      operation.progress.running = false;
      this.notifyOperationChanged(operation);

      // server: notify not running
      this.updateServerStatus({isRunning: false});

      // start another operation (if there's any in line)
      this.startNextOperation();
    };

    // long-lasting function (up to a day)
    this.gitHubAnalyzer.executeAsync(operation.request, onProgress)
      .then(onFulfilled).catch(onRejected).finally(andFinally);
  }

  /// Private ///

  private notifyListChanged = () =>
    this.socketSendAll('@ghk:ops-list', this.operationsList);
  private notifyOperationChanged = (operation: ResultType) =>
    this.socketSendAll('@ghk:op-update', operation);
  private updateServerStatus = (update: Partial<ServerStatusType>) =>
    this.updateAndNotify(this.serverStatus, '@ghk:status', update);

  private updateAndNotify = <T>(target: T, messageName: string, update: Partial<T>): void => {
    Object.assign(target, update);
    this.socketSendAll(messageName, target);
  }
}


/** main logic **/

// Server for Socket.IO and REST calls
const expressApp = require('express')();
const httpServer: Server = createServer(expressApp);
expressApp.get(API_PATH_CATCH_ALL, (req, res) => setTimeout(() => res.send({error: 404}), 1000)); // Delay API discovery

const main = new Main(httpServer);

httpServer.listen(API_PORT, API_HOST, () =>
  printAppRoutes('github-kpis-webserver', httpServer, expressApp, main.socketApiServer.getSocketIoServer()));
