// The only thing the rest of src/net/ knows about the network. Messages are plain JSON values.

export type ConnectionStatus = "connecting" | "open" | "closed";

// One link between two peers.
export interface Connection {
  readonly status: ConnectionStatus;
  send(message: unknown): void;
  onReceive(handler: (message: unknown) => void): void;
  onStatus(handler: (status: ConnectionStatus) => void): void;
  close(): void;
}

export interface Transport {
  // Host side: accept connections addressed to peerId. Resolves when ready.
  listen(peerId: string, onConnection: (connection: Connection) => void): Promise<void>;
  // Client side: connect to a listening peer. Resolves when the connection is open.
  connect(peerId: string): Promise<Connection>;
  // Closes everything this transport opened.
  close(): void;
}
