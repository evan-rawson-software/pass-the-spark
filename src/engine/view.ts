// Per-player views: the battle state, plus the open ends with their charge.

import type { BattleState } from "./battle";
import { getOpenEnds, scaledIntent, upcomingIntents } from "./battle";
import type { EnemyState } from "./battle";
import { getRunWindow } from "./run";
import type { RunState } from "./run";
import type { Intent, Spark } from "./types";
import { spyglassRounds } from "./battleCharms";

// An open end of the board. charge is what reaches it; triggers is how many times a cap placed there would go off.
export interface OpenEndView {
  end: number;
  node: number;
  index: number;
  spark: Spark;
  charge: number;
  triggers: number;
}

// enemy leaves out the intent list, the pattern and the rolled queue, so only Spyglass shows more than this round's intent.
// openEnds and upcomingIntents are for the player the view is for.
export type BattleView = Omit<BattleState, "rng" | "enemy"> & {
  enemy: Omit<EnemyState, "intents" | "pattern" | "queue" | "rolled" | "lastIntent" | "repeats">;
  openEnds: OpenEndView[];
  upcomingIntents: Intent[]; // the intents of the next rounds: empty unless this player holds Spyglass
};

// Hands and this round's intent are open to everyone. The open ends show what a cap this player
// places would get (their charms count), and Spyglass shows its holder the next intents.
// Returns a copy; the input is not changed.
export function getView(state: BattleState, playerId: string): BattleView {
  if (!state.players.some((p) => p.id === playerId)) throw new Error("no such player " + playerId);
  const copy: BattleState = JSON.parse(JSON.stringify(state));
  const { rng, enemy, ...rest } = copy;
  const { intents, pattern, queue, rolled, lastIntent, repeats, ...enemyView } = enemy;
  return { ...rest, intent: scaledIntent(copy, copy.intent), enemy: enemyView, openEnds: getOpenEnds(copy, playerId), upcomingIntents: upcomingIntents(copy, spyglassRounds(copy, playerId)) };
}

// The run as a player sees it. Everything in a run is open information (maps, decks, coins, offers,
// stock and votes), so the view is the same for every player. It leaves out the seeded RNG, the
// battle (battles have their own views) and the content, which every player already has. The
// hidden floor's stop types are masked, and the current event (its domino, options and live votes) is open; the list of events already seen is
// left out, since it would tell players which events can't come next.
// window names the decision the run is waiting on (see getRunWindow). Returns a copy.
export type RunView = Omit<RunState, "rng" | "battle" | "content" | "eventsSeen"> & { window: string };

export function getRunView(run: RunState, playerId: string): RunView {
  if (!run.players.includes(playerId)) throw new Error("no such player " + playerId);
  const copy: RunState = JSON.parse(JSON.stringify(run));
  const { rng, battle, content, eventsSeen, ...rest } = copy;
  // The hidden floor's stop types are not for players to see: they all read as the same stop.
  if (rest.hiddenFloor !== null) rest.map.floors[rest.hiddenFloor - 1]?.forEach((node) => (node.type = "event"));
  return { ...rest, window: getRunWindow(run) };
}
