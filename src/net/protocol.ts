// The messages. Plain JSON, each with a `type`.

import type { Choice } from "../engine/battle";
import type { GameEvent } from "../engine/events";
import type { RunChoice, RunEvent } from "../engine/run";
import type { BattleView, RunView } from "../engine/view";

// A domino a ping points at, named by position so it can only ever name a visible one: a seat's
// hand slot, a place in this battle's chain, or a revealed slot in the enemy's hand.
export type PingTarget =
  | { zone: "hand"; seat: string; index: number }
  | { zone: "chain"; index: number }
  | { zone: "enemy"; index: number };

// client -> host
export type ClientMessage =
  | { type: "hello"; buildId: string; name: string; token: string; unlocks: string[] }
  // A choice in a battle.
  | { type: "choice"; choice: Choice }
  // This player's unlocks changed (after a run). Only counts between runs.
  | { type: "unlocks"; unlocks: string[] }
  // Any other choice in the run (a vote, a reward pick, rest, upgrade, Trader). window is the
  // decision the player was looking at (RunView.window); the host ignores a choice for an earlier one.
  | { type: "runChoice"; choice: RunChoice; window: string }
  // Point at a domino for the whole party. Not game state: the host checks it and relays it.
  | { type: "ping"; target: PingTarget };

// host -> client
export type HostMessage =
  | { type: "welcome"; seat: string; token: string }
  | { type: "refused"; reason: string }
  | { type: "lobby"; players: { seat: string; name: string; level: number; away?: boolean }[]; seats: string[] }
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
  // The run has ended: the experience it earned, sent to everyone in the room at that moment.
  | { type: "experience"; runId: string; gained: number }
  // A ping the host has checked, from the seat's own connection. Sent to everyone, the pinger included.
  | { type: "ping"; seat: string; name: string; target: PingTarget }
  | { type: "error"; message: string };

// Refusal texts the screens show as they are. The build one gets a refresh button.
export const REFUSED_BUILD = "The game was updated. Refresh the page.";
export const REFUSED_KICKED = "The host removed you from the room.";
