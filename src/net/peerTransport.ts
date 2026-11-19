// The PeerJS transport: WebRTC through PeerJS and its free public broker.
// This is the only file in src/ that imports peerjs.

import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import type { Connection, ConnectionStatus, Transport } from "./transport";

class PeerConnection implements Connection {
  status: ConnectionStatus = "connecting";
  private receivers: ((m: unknown) => void)[] = [];
  private statusHandlers: ((s: ConnectionStatus) => void)[] = [];

  constructor(private conn: DataConnection) {
    conn.on("data", (data) => this.receivers.forEach((h) => h(data)));
    conn.on("open", () => this.setStatus("open"));
    conn.on("close", () => this.setStatus("closed"));
    conn.on("error", () => this.setStatus("closed"));
    if (conn.open) this.setStatus("open");
  }
  send(message: unknown): void {
    this.conn.send(message);
  }
  onReceive(handler: (m: unknown) => void): void {
    this.receivers.push(handler);
  }
  onStatus(handler: (s: ConnectionStatus) => void): void {
    this.statusHandlers.push(handler);
  }
  close(): void {
    this.conn.close();
    this.setStatus("closed");
  }
  private setStatus(s: ConnectionStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.statusHandlers.forEach((h) => h(s));
  }
}

export function createPeerTransport(): Transport {
  const peers: Peer[] = [];

  function openPeer(id?: string): Promise<Peer> {
    return new Promise((resolve, reject) => {
      const peer = id === undefined ? new Peer() : new Peer(id);
      peers.push(peer);
      peer.on("open", () => resolve(peer));
      peer.on("error", (err) => reject(err));
    });
  }

  return {
    async listen(peerId, onConnection) {
      const peer = await openPeer(peerId);
      peer.on("connection", (conn) => {
        const c = new PeerConnection(conn);
        // Hand it over once it can carry messages.
        if (c.status === "open") onConnection(c);
        else c.onStatus((s) => s === "open" && onConnection(c));
      });
    },
    async connect(peerId) {
      const peer = await openPeer();
      const conn = peer.connect(peerId, { serialization: "json", reliable: true });
      const c = new PeerConnection(conn);
      return new Promise<Connection>((resolve, reject) => {
        if (c.status === "open") return resolve(c);
        c.onStatus((s) => (s === "open" ? resolve(c) : reject(new Error("connection closed"))));
        peer.on("error", (err) => reject(err));
      });
    },
    close() {
      for (const p of peers) p.destroy();
    },
  };
}
