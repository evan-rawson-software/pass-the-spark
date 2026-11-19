// The messages. Plain JSON, each with a `type`.

import type { Choice } from "../engine/battle";
import type { GameEvent } from "../engine/events";
import type { RunChoice, RunEvent } from "../engine/run";
import type { BattleView, RunView } from "../engine/view";

// client -> host
export type ClientMessage =
  | { type: "hello"; buildId: string; name: string; token: string }
  // A choice in a battle.
  | { type: "choice"; choice: Choice }
  // Any other choice in the run (a vote, a reward pick, rest, upgrade, Trader). window is the
  // decision the player was looking at (RunView.window); the host ignores a choice for an earlier one.
  | { type: "runChoice"; choice: RunChoice; window: string };

// host -> client
export type HostMessage =
  | { type: "welcome"; seat: string; token: string }
  | { type: "refused"; reason: string }
  | { type: "lobby"; players: { seat: string; name: string; away?: boolean }[]; seats: string[] }
  | { type: "update"; view: BattleView; events: GameEvent[] }
  // The run outside its battles: the state after a step, and the run's own events from it. Sent to
  // everyone after every step that is not a move inside a battle, and when a player (re)joins.
  | { type: "runUpdate"; view: RunView; events: RunEvent[] }
  // Who is connected, sent to everyone whenever it changes during a run.
  | { type: "presence"; players: { seat: string; name: string; away: boolean }[] }
  // The run is waiting on seats whose players are away (null: not waiting; waitingFor lists their names).
  // `playFor` goes only to the host, once the wait has been long enough: the seat it may take over.
  | { type: "paused"; waitingFor: string | null; playFor?: string }
  // Host only: the seat the host is playing for right now (null: only its own).
  | { type: "playing-for"; seat: string | null }
  | { type: "error"; message: string };

// Refusal texts the screens show as they are. The build one gets a refresh button.
export const REFUSED_BUILD = "The game was updated. Refresh the page.";
export const REFUSED_KICKED = "The host removed you from the room.";
