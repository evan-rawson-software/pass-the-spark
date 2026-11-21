import type { LinkStatus } from "../net/client";
import type { HostMessage } from "../net/protocol";
import { awardExperience } from "./profile";
import { playRunEventSounds } from "./sound";

// Where messages from the host go on this machine. The host's own player (onLocalMessage) and a
// joined client (onMessage) both hand every message to relay.deliver, and whichever screen is
// showing sets relay.handler. That way the lobby, the battle and the run screens can take over from
// each other without re-creating the host or client.

export type Lobby = Extract<HostMessage, { type: "lobby" }>;
type Presence = Extract<HostMessage, { type: "presence" }>;
type Paused = Extract<HostMessage, { type: "paused" }>;
type BattleUpdate = Extract<HostMessage, { type: "update" }>;
type RunUpdate = Extract<HostMessage, { type: "runUpdate" }>;

export const relay = {
  handler: null as ((message: HostMessage) => void) | null,
  // The newest lobby message. Cleared when a run starts; a lobby message after that means
  // the host sent everyone back to the lobby.
  lobby: null as Lobby | null,
  // The latest of each kind of status message, kept here so a screen that opens late still has them.
  roster: null as Presence | null,
  paused: null as Paused | null,
  playingFor: null as string | null, // host only
  // The newest battle update. Cleared when the run says a battle has opened, so the table that
  // opens next always starts from that battle's first view.
  battle: null as BattleUpdate | null,
  // Called with every run update before the screen's handler sees it, so the run the screens draw
  // is current even while no screen is listening (runSession sets it for an online run).
  onRun: null as ((message: RunUpdate) => void) | null,
  // Client only: the link to the host, and who to tell when it changes.
  link: "ok" as LinkStatus,
  onLink: null as ((status: LinkStatus) => void) | null,
  // Client only: why the host refused us (when it did), so a screen that opens late can show it.
  refused: null as string | null,
  deliver(message: HostMessage): void {
    if (message.type === "lobby") this.lobby = message;
    else if (message.type === "presence") this.roster = message;
    else if (message.type === "paused") this.paused = message;
    else if (message.type === "playing-for") this.playingFor = message.seat;
    else if (message.type === "update") this.battle = message;
    else if (message.type === "experience") awardExperience(message.runId, message.gained);
    else if (message.type === "runUpdate") {
      if (message.view.phase === "battle") this.battle = null;
      playRunEventSounds(message.events);
      this.onRun?.(message);
    } else if (message.type === "refused") {
      this.refused = message.reason;
      this.onLink?.(this.link);
    }
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
    this.battle = null;
    this.onRun = null;
    this.link = "ok";
    this.refused = null;
  },
};
