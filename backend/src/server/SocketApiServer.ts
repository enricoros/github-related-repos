import {Server as SIOServer, Socket as SIOSocket} from 'socket.io';
import {Server as HttpServer} from "http";
import {err, log} from "./util";

// Module configuration
const LOG_EVENTS = true;

/**
 * Interface to get notified of new clients connecting and disconnecting
 */
export interface ServerConnectionEventsType {
  // client connected: use the 'ClientCommInterface' methods to communicate with the client and register all the client events
  clientConnected(socketUid: string, clientComm: ClientCommProxyType): void;

  // client disconnected
  clientDisconnected(socketUid: string, reason: any): void;
}

/**
 * Interface to send data to a client and subscribe to the client's messages
 */
export interface ClientCommProxyType {
  onClientMessage(messageName: string, callback: (...args: any[]) => void);

  sendToClient(msgName: string, payload: any);
}

// encapsulation of the functions for sending and receiving messages from the Client, without exposing the socket directly
class ClientCommProxy implements ClientCommProxyType {
  private clientSocket: SIOSocket;
  private readonly clientSocketUid: string;

  constructor(socketIoServer: SIOServer, clientSocket: SIOSocket) {
    this.clientSocket = clientSocket;
    this.clientSocketUid = clientSocket.id;
  }

  // <-- client incoming messages
  onClientMessage(messageName: string, handler/*: (...args: any[]) => void*/) {
    if (!this.clientSocket) return err(`onClientMessage after socket ${this.clientSocketUid} closed`);
    this.clientSocket.on(messageName, handler);
  }

  // --> client unicast messages
  sendToClient = (msgName: string, payload: any) => {
    if (!this.clientSocket) return err(`sendToClient after socket ${this.clientSocketUid} closed`);
    this.clientSocket.emit(msgName, payload);
  };

  onDisconnected = () => {
    this.clientSocket = null;
  };
}

/**
 * API server: provides client connect/disconnect events, and methods to communicate with the client
 */
export class SocketApiServer {
  private readonly socketIoServer: SIOServer;
  private readonly currentClients: string[] = [];

  constructor(sio_path: string, corsDomain: string, httpServer: HttpServer, apiConnectionsListener: ServerConnectionEventsType) {
    // create the Socket.IO server to accept client connections
    this.socketIoServer = new SIOServer(httpServer, {
      path: sio_path,             // serve on the designated api path (instead of /socket.io)
      serveClient: false,         // don't serve the /socket.io/socket.io.js file
      transports: ['websocket'],  // force websockets only (no polling)
      cors: {
        origin: [                 // limit CORS (default: enabled to *)
          `https://${corsDomain}:443`,  // requests from the same domain
          'http://localhost:3000',      // requests from a localhost 'react serve'
        ],
        methods: ["GET", "POST"],
      },
      pingInterval: 30000,        // engine.IO: how long to wait before issuing a ping
      pingTimeout: 5000,          // engine.IO: hot long after the ping to consider the client disconnected
    });

    // when a client connects, create a ClientCommProxyType and install the disconnection handler
    this.socketIoServer.on('connection', (clientSocket) => {
      const socketUid: string = clientSocket.id;

      // sanity check
      if (this.currentClients.includes(socketUid))
        return err(`clientConnected: ${socketUid} already connected`);
      this.currentClients.push(socketUid);
      if (LOG_EVENTS) log(` > ${socketUid} [${Object.keys(this.currentClients).length}]`)

      const clientCommProxy = new ClientCommProxy(this.socketIoServer, clientSocket);

      // handle future disconnection of this socket.io client
      clientSocket.on('disconnect', (reason) => {
        clientCommProxy.onDisconnected();

        // sanity check: disconnection
        if (!this.currentClients.includes(socketUid))
          return err(`clientDisconnected: ${socketUid} not present`);
        this.currentClients.splice(this.currentClients.indexOf(socketUid), 1);
        if (LOG_EVENTS) log(` < ${socketUid} [${Object.keys(this.currentClients).length}] (${reason})`)

        // notify about the disconnection of the client
        apiConnectionsListener.clientDisconnected(socketUid, reason)
      });

      // notify about the connection of the client, wrapping socket.io under a simple interface
      apiConnectionsListener.clientConnected(socketUid, clientCommProxy);
    });
  }

  // --> client broadcast messages - for unicast sends, see the ClientCommInterface
  sendAll = (messageName: string, payload: any) => this.socketIoServer.emit(messageName, payload);

  getSocketIoServer = (): SIOServer => this.socketIoServer;
}
