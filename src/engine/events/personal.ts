// Personal events: every player chooses for themselves, all at the same time, and every one offers
// Skip. This is the shared part: the option list (Skip first), who may take what, applying one
// player's choice and the summary once everyone has chosen. Each event supplies a handler (see
// deckEvents.ts); a new personal event adds its handler to HANDLERS below.
// The options are the same for every player, so a player's choice is an index into event.options.
// Option 0 is always Skip. Players who haven't chosen yet are the run's pending event choices.

import type { EventOption } from "../eventStops";
import type { RunEvent, RunState } from "../run";
import type { Domino, EventData, Spark, UpgradeSide } from "../types";
import { deckEventHandlers } from "./deckEvents";
import { wishingWellHandler } from "./wishingWell";
import type { PrizeKind } from "./wishingWell";

// "skip" is the only action every event shares; the rest belong to the events that offer them.
export type PersonalAction = "skip" | "flip" | "repaint" | "copy" | "weld" | "wish";

// What the player picked with their option: dominoes from their own deck (instance ids, in pick
// order), and for a repaint which spark on which half becomes which spark.
export interface EventPick {
  dominoes: string[];
  half?: "intake" | "output";
  slot?: number; // which of the half's sparks
  spark?: Spark; // the new spark (a repaint); the added intake spark (a left upgrade); the output that counts (Wishing Well)
  side?: UpgradeSide; // Wishing Well: which side of the domino to upgrade
  offer?: string; // Wishing Well: the id of the offered domino taken
}

// What one player did, kept in the event and shown to everyone in the summary.
// before: the dominoes taken or changed; after: the domino that came out (null for Skip).
export interface PersonalResult {
  action: PersonalAction;
  cost: number; // coins paid
  before: Domino[];
  after: Domino | null;
  // The Wishing Well: the domino turned over, the spark that counted (null if skipped before choosing)
  // and the prize paid. before/after are the domino removed or upgraded, or the rare taken.
  wish?: { turned: Domino; spark: Spark | null; prize: PrizeKind | "none"; coins: number };
}

export interface PersonalHandler {
  // The event's options after Skip. cost is in coins.
  actions(data: EventData): { action: Exclude<PersonalAction, "skip">; cost: number }[];
  // Why this player can't take the action at all right now, or null when they can.
  unavailable(run: RunState, player: string, action: PersonalAction, cost: number): string | null;
  // Applies the action to the run (mutating it) and says what happened. Throws when the pick is illegal.
  // null: the player isn't finished (a multi-step event) and is asked again; the handler keeps its own state.
  apply(run: RunState, player: string, action: PersonalAction, cost: number, pick: EventPick | undefined): PersonalResult | null;
  // What Skip records for this player, when it should say more than "skipped".
  skipped?(run: RunState, player: string): PersonalResult;
}

const HANDLERS: Record<string, PersonalHandler> = {
  tinkers_bench: deckEventHandlers.tinkers_bench,
  mirror_pond: deckEventHandlers.mirror_pond,
  twin_forge: deckEventHandlers.twin_forge,
  wishing_well: wishingWellHandler,
};

export function personalOptions(data: EventData): EventOption[] {
  const handler = HANDLERS[data.id];
  if (!handler) throw new Error(`event ${data.id} is not a personal event`);
  return [{ type: "skip" }, ...handler.actions(data).map((a): EventOption => ({ type: "action", ...a }))];
}

// Why a player can't take option `option` right now, or null. Skip is always possible.
export function personalUnavailable(run: RunState, player: string, option: number): string | null {
  const event = run.event;
  if (!event) throw new Error("no event");
  const o = event.options[option];
  if (!o) throw new Error(`option ${option} is not offered`);
  if (o.type === "skip") return null;
  if (o.type !== "action") throw new Error(`option ${option} is not offered`);
  return HANDLERS[event.id].unavailable(run, player, o.action, o.cost);
}

// Applies one player's choice: checks it, changes their deck and coins, and records the result.
// Throws when the choice isn't legal. Returns true once everyone has chosen.
export function applyPersonalChoice(run: RunState, player: string, option: number, pick: EventPick | undefined, events: RunEvent[]): boolean {
  const event = run.event;
  if (!event) throw new Error("no event");
  const o = event.options[option];
  if (!Number.isInteger(option) || !o || (o.type !== "action" && o.type !== "skip")) throw new Error(`option ${option} is not offered`);
  if (event.choices[player] !== undefined) throw new Error(`${player} has already chosen`);
  const handler = HANDLERS[event.id];
  let result: PersonalResult | null;
  if (o.type === "skip") {
    if (pick !== undefined) throw new Error("Skip takes no pick");
    result = handler.skipped?.(run, player) ?? { action: "skip", cost: 0, before: [], after: null };
  } else {
    const why = handler.unavailable(run, player, o.action, o.cost);
    if (why !== null) throw new Error(why);
    result = handler.apply(run, player, o.action, o.cost, pick);
    if (result === null) return false; // a step of a longer choice: the player is asked again
  }
  event.choices[player] = option;
  (event.results ??= {})[player] = result;
  events.push({ type: "eventChoice", player, option });
  return run.players.every((id) => event.choices[id] !== undefined);
}

// Everyone has chosen: the summary of what each player did, in seat order.
export function personalSummary(run: RunState): RunEvent {
  const event = run.event;
  if (!event) throw new Error("no event");
  return { type: "eventSummary", event: event.id, results: run.players.map((player) => ({ player, ...(event.results ?? {})[player] })) };
}
