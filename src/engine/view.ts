// Per-player views: the battle state, plus the open ends with their charge.

import type { BattleState } from "./battle";
import { getOpenEnds } from "./battle";
import { getRunWindow } from "./run";
import type { RunState } from "./run";
import type { Spark } from "./types";

// An open end of the board. charge is what reaches it; triggers is how many times a cap placed there would go off.
export interface OpenEndView {
  end: number;
  node: number;
  index: number;
  spark: Spark;
  charge: number;
  triggers: number;
}

export interface BattleView extends Omit<BattleState, "rng"> {
  openEnds: OpenEndView[];
}

// Nothing in a battle is hidden (hands and intents are open), so the view is the same for every player.
// Returns a copy; the input is not changed.
export function getView(state: BattleState, playerId: string): BattleView {
  if (!state.players.some((p) => p.id === playerId)) throw new Error("no such player " + playerId);
  const copy: BattleState = JSON.parse(JSON.stringify(state));
  const { rng, ...rest } = copy;
  return { ...rest, openEnds: getOpenEnds(copy) };
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
