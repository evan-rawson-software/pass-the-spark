import type { HostMessage } from "../net/protocol";

// Where messages from the host go on this machine. The host's own player (onLocalMessage) and a
// joined client (onMessage) both hand every message to relay.deliver, and whichever screen is
// showing sets relay.handler. That way the lobby, the battle and the end screen can take over from
// each other without re-creating the host or client.

export type Lobby = Extract<HostMessage, { type: "lobby" }>;

export const relay = {
  handler: null as ((message: HostMessage) => void) | null,
  // The newest lobby message. Cleared when a battle starts; a lobby message after that means
  // the host sent everyone back to the lobby.
  lobby: null as Lobby | null,
  deliver(message: HostMessage): void {
    if (message.type === "lobby") this.lobby = message;
    this.handler?.(message);
  },
};
