import type { LinkStatus } from "../net/client";
import type { HostMessage } from "../net/protocol";

// Where messages from the host go on this machine. The host's own player (onLocalMessage) and a
// joined client (onMessage) both hand every message to relay.deliver, and whichever screen is
// showing sets relay.handler. That way the lobby, the battle and the end screen can take over from
// each other without re-creating the host or client.

export type Lobby = Extract<HostMessage, { type: "lobby" }>;
type Presence = Extract<HostMessage, { type: "presence" }>;
type Paused = Extract<HostMessage, { type: "paused" }>;

export const relay = {
  handler: null as ((message: HostMessage) => void) | null,
  // The newest lobby message. Cleared when a battle starts; a lobby message after that means
  // the host sent everyone back to the lobby.
  lobby: null as Lobby | null,
  // The latest of each kind of status message, kept here so a screen that opens late still has them.
  roster: null as Presence | null,
  paused: null as Paused | null,
  playingFor: null as string | null, // host only
  // Client only: the link to the host, and who to tell when it changes.
  link: "ok" as LinkStatus,
  onLink: null as ((status: LinkStatus) => void) | null,
  deliver(message: HostMessage): void {
    if (message.type === "lobby") this.lobby = message;
    else if (message.type === "presence") this.roster = message;
    else if (message.type === "paused") this.paused = message;
    else if (message.type === "playing-for") this.playingFor = message.seat;
    this.handler?.(message);
  },
  setLink(status: LinkStatus): void {
    this.link = status;
    this.onLink?.(status);
  },
  // A new room: forget everything about the last one.
  reset(): void {
    this.lobby = null;
    this.roster = null;
    this.paused = null;
    this.playingFor = null;
    this.link = "ok";
  },
};
