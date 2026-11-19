// An in-memory transport for tests. Messages are JSON-copied and delivered asynchronously,
// like a real network would.

import type { Connection, ConnectionStatus, Transport } from "./transport";

class MemoryConnection implements Connection {
  status: ConnectionStatus = "connecting";
  peer: MemoryConnection | null = null;
  private receivers: ((m: unknown) => void)[] = [];
  private statusHandlers: ((s: ConnectionStatus) => void)[] = [];

  send(message: unknown): void {
    if (this.status !== "open" || !this.peer) throw new Error("connection not open");
    const copy = JSON.parse(JSON.stringify(message)) as unknown;
    const peer = this.peer;
    queueMicrotask(() => {
      if (peer.status === "open") peer.receivers.forEach((h) => h(copy));
    });
  }
  onReceive(handler: (m: unknown) => void): void {
    this.receivers.push(handler);
  }
  onStatus(handler: (s: ConnectionStatus) => void): void {
    this.statusHandlers.push(handler);
  }
  close(): void {
    if (this.status === "closed") return;
    this.setStatus("closed");
    this.peer?.setStatus("closed");
  }
  setStatus(s: ConnectionStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.statusHandlers.forEach((h) => h(s));
  }
}

// All transports made from one network can reach each other.
export function createMemoryNetwork(): { createTransport(): Transport } {
  const listeners = new Map<string, (c: Connection) => void>();

  return {
    createTransport(): Transport {
      const opened: MemoryConnection[] = [];
      const myIds: string[] = [];
      return {
        async listen(peerId, onConnection) {
          if (listeners.has(peerId)) throw new Error("peer id taken: " + peerId);
          listeners.set(peerId, onConnection);
          myIds.push(peerId);
        },
        async connect(peerId) {
          const onConnection = listeners.get(peerId);
          if (!onConnection) throw new Error("no such peer: " + peerId);
          const mine = new MemoryConnection();
          const theirs = new MemoryConnection();
          mine.peer = theirs;
          theirs.peer = mine;
          opened.push(mine);
          mine.setStatus("open");
          theirs.setStatus("open");
          onConnection(theirs);
          return mine;
        },
        close() {
          for (const id of myIds) listeners.delete(id);
          for (const c of opened) c.close();
        },
      };
    },
  };
}
