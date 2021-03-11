import {io as ioClient, Socket} from 'socket.io-client';
import {ListSubscribable, ObjectSubscribable} from "./Subscribable";
import {RequestType, ResultType, ServerStatusType} from "../../../common/SharedTypes";

// Module Configuration
const DEBUG_CONNECTION = false;
const DEFAULT_HOST = window.location.hostname || '127.0.0.1';
const DEFAULT_PORT = '1996';
const API_PATH_SIO = '/api/socket';

const log = DEBUG_CONNECTION ? console.log : () => null;
const err = console.error;

// managed by the client
export interface ConnectionStatus {
  connected: boolean,
  errorMessage: null | string,
  serverStatus: ServerStatusType,
}


class Connector {
  private serverSocket?: Socket = null;

  // UI-subscribable status
  public readonly connection = new ObjectSubscribable<ConnectionStatus>({
    connected: false,
    errorMessage: null,
    serverStatus: undefined,
  });
  public readonly operationsList = new ListSubscribable<ResultType>([]);

  constructor() {
    this.connectToServer(DEFAULT_HOST, DEFAULT_PORT, API_PATH_SIO);
  }

  sendNewOperation(request: RequestType) {
    if (!this.serverSocket || !this.serverSocket.connected) return err(`Connector.sendNewOperation: disconnected`);
    this.serverSocket.emit('@ghk/op/add', request);
  }

  /// Private ///

  private connectToServer(host: string, port: string, sio_path: string) {
    // disconnect and reset the connection state
    this.disconnect();
    this.connection.partialUpdate({connected: false, errorMessage: null});

    // create a stable websocket connection to the server
    const serverURI = `${host}:${port}`
    if (DEBUG_CONNECTION) log(`Connector: connecting to: ${serverURI}`);
    this.serverSocket = ioClient(serverURI, {
      path: sio_path,
      transports: ['websocket']
    });

    // socket connection/disconnection events
    this.serverSocket.on('connect', () => this.connection.partialUpdate({connected: true, errorMessage: null}));
    this.serverSocket.on('disconnect', () => this.connection.partialUpdate({connected: false, errorMessage: null}));
    this.serverSocket.on('connect_error', error => this.connection.partialUpdate({
      connected: false,
      errorMessage: (error || '<unknown>').toString(),
    }));
    if (DEBUG_CONNECTION)
      this.serverSocket.onAny((name, param1) => console.log(`Connector: '${name}'`, param1));

    // <- server messages
    this.serverSocket.on('@ghk:message', v => console.log('message from the server:', v));

    this.serverSocket.on('@ghk:status', serverStatus =>
      this.connection.partialUpdate({serverStatus: serverStatus}));

    this.serverSocket.on('@ghk:ops-list', (operationsList: ResultType[]) =>
      this.operationsList.replaceListContent(operationsList));

    this.serverSocket.on('@ghk:op-update', (operation: ResultType) =>
      this.operationsList.updateListItem(operation, item => item.uid === operation.uid));
  }

  private disconnect = () => this.serverSocket && this.serverSocket.disconnect();
}

export const connector = new Connector();