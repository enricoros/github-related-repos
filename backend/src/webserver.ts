import {createServer, Server} from "http";
import {ClientCommProxyType, ServerConnectionEventsType, SocketApiServer} from "./server/SocketApiServer";
import {GitHubAPI} from "./worker/GitHubAPI";
import {createNoProgress, GitHubAnalyzer, ScanConfigurationType, ScanProgressType} from "./worker/GitHubAnalyzer";
import {err, log, printAppRoutes} from "./server/util";
import {unixTimeNow} from "./worker/Utils";


// Module Configuration - API_HOST, API_PORT are overridable by the Environment
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = parseInt(process.env.API_PORT || '1996');
const API_PATH_SIO = '/api/socket';
const API_PATH_CATCH_ALL = '/api/*';
const PUBLIC_DOMAIN = 'www.githubkpis.com';


/**
 * Synchronize this with the Client
 */
export interface ScanType {
  configuration: ScanConfigurationType,
  progress: ScanProgressType,
  requesterUid: string,
  outputFile: string,
}


class Main implements ServerConnectionEventsType {
  private readonly socketApiServer: SocketApiServer;
  private readonly socketSendAll: (messageName: string, payload: any) => any;
  private readonly gitHubAnalyzer: GitHubAnalyzer;

  // state
  private isScanning: Boolean = false;
  private readonly scansCompleted: ScanType[] = [];
  private readonly scansQueue: ScanType[] = [];

  constructor(httpServer: Server) {
    this.socketApiServer = new SocketApiServer(API_PATH_SIO, PUBLIC_DOMAIN, httpServer, this as ServerConnectionEventsType);
    this.socketSendAll = this.socketApiServer.sendAll;

    // create the Analyzer for GitHub
    const graphQLApi = new GitHubAPI();
    this.gitHubAnalyzer = new GitHubAnalyzer(graphQLApi);
  }

  /// Connection/Disconnection Events ///

  clientConnected(socketUid: string, clientComm: ClientCommProxyType): void {
    // receive client messages
    clientComm.onClientMessage('@ghk/related/start', (conf: ScanConfigurationType) => this.addRelatedScan(conf, socketUid));

    // -> client: current configuration
    clientComm.sendToClient('@ghk:scans-former', this.scansCompleted);
    clientComm.sendToClient('@ghk:scans-queue', this.scansQueue);
  }

  clientDisconnected(socketUid: string, reason: any): void {
    // NOP
  }

  /// Client Operations ///

  private addRelatedScan(conf: ScanConfigurationType, socketUid: string) {
    // TODO: Conf Validation
    // ...

    // TODO: find a previous scan with the same configuration, and eventually replace it
    // this.nextScans.find()

    // enqueue scan
    this.scansQueue.push({
      configuration: conf,
      progress: createNoProgress(),
      requesterUid: socketUid,
      outputFile: undefined,
    });
    this.notifyScansQueue();
    this.tryStartNextScan();
  }

  private startNextScan() {
    // sanity checks
    if (this.isScanning) return err(`startNextScan: called while already scanning (${this.scansQueue.length} items in queue)`);
    if (this.scansQueue.length < 1) return err(`startNextScan: with 0 scan configurations in line`);

    // scan the first element
    this.isScanning = true;
    const scan: ScanType = this.scansQueue.shift();
    const scanRepoName = scan.configuration.repoFullName;
    const scanStartTime = unixTimeNow();

    // notification callback
    const scanProgressCallback = (progress: ScanProgressType) => {
      log('got progress', progress);
      scan.progress = progress;
      this.notifyScansQueue();
    }

    // long-lasting function (up to a day)
    this.gitHubAnalyzer.findAndAnalyzeRelatedRepos(scan.configuration, scanProgressCallback)
      .then(value => {
        // handle completed
        log(value);
        log(`\nAnalysis of '${scanRepoName}' complete in ${unixTimeNow() - scanStartTime} seconds.\n`);
      })
      .catch(reason => {
        // handle errors
        err(`\nERROR: Analysis of '${scanRepoName}' FAILED after ${unixTimeNow() - scanStartTime} seconds, because: ${reason}\n`)
      })
      .finally(() => {
        // start another scan if the queue is waiting
        this.isScanning = false;
        this.tryStartNextScan();
      });
  }

  /// Private ///

  private tryStartNextScan = () => !this.isScanning && this.scansQueue.length > 0 && this.startNextScan();
  private notifyScansQueue = () => this.socketSendAll('@ghk:scans-queue', this.scansQueue);
  private notifyScansCompleted = () => this.socketSendAll('@ghk:scans-former', this.scansCompleted);

  /// Misc ///

  getSocketIoServer = () => this.socketApiServer.getSocketIoServer();
}


/** main logic **/

// Server for Socket.IO and REST calls
const expressApp = require('express')();
const httpServer: Server = createServer(expressApp);
expressApp.get(API_PATH_CATCH_ALL, (req, res) => setTimeout(() => res.send({error: 404}), 1000)); // Delay API discovery

const main = new Main(httpServer);

httpServer.listen(API_PORT, API_HOST, () =>
  printAppRoutes('github-kpis-webserver', httpServer, expressApp, main.getSocketIoServer()));
