// The messages. Plain JSON, each with a `type`.

import type { Choice } from "../engine/battle";
import type { GameEvent } from "../engine/events";
import type { BattleView } from "../engine/view";

// client -> host
export type ClientMessage =
  | { type: "hello"; buildId: string; name: string; token: string }
  | { type: "choice"; choice: Choice };

// host -> client
export type HostMessage =
  | { type: "welcome"; seat: string; token: string }
  | { type: "refused"; reason: string }
  | { type: "lobby"; players: { seat: string; name: string; away?: boolean }[]; seats: string[]; enemyId: string }
  | { type: "update"; view: BattleView; events: GameEvent[] }
  // Who is connected, sent to everyone whenever it changes during a battle.
  | { type: "presence"; players: { seat: string; name: string; away: boolean }[] }
  // The game is waiting on a seat whose player is away (null: not waiting). `playFor` goes only to the
  // host, once the wait has been long enough: the seat it may take over.
  | { type: "paused"; waitingFor: string | null; playFor?: string }
  // Host only: the seat the host is playing for right now (null: only its own).
  | { type: "playing-for"; seat: string | null }
  | { type: "error"; message: string };

// Refusal texts the screens show as they are. The build one gets a refresh button.
export const REFUSED_BUILD = "The game was updated. Refresh the page.";
export const REFUSED_KICKED = "The host removed you from the room.";
