// Per-player views: the battle state with the enemy's hidden information removed.

import type { BattleState, EnemyState } from "./battle";
import { getRunWindow } from "./run";
import type { RunState } from "./run";

// A hand slot as the players see it: a revealed domino, or only a position.
export type HandSlot = { revealed: true; domino: string } | { revealed: false };

export interface EnemyView extends Omit<EnemyState, "deck" | "hand" | "revealed"> {
  deckList: string[]; // every domino in the enemy's deck, sorted (order hidden)
  deckCount: number; // how many are left to draw (public, like the players' deck sizes)
  hand: HandSlot[];
}

export interface BattleView extends Omit<BattleState, "rng" | "enemy"> {
  enemy: EnemyView;
}

// Player hands are open, so the view is the same for every player.
// Returns a copy; the input is not changed.
export function getView(state: BattleState, playerId: string): BattleView {
  if (!state.players.some((p) => p.id === playerId)) throw new Error("no such player " + playerId);
  const copy: BattleState = JSON.parse(JSON.stringify(state));
  const { rng, enemy, ...rest } = copy;
  const { deck, hand, revealed, ...enemyRest } = enemy;
  return {
    ...rest,
    enemy: {
      ...enemyRest,
      deckList: deck.concat(hand, enemy.discard).sort(),
      deckCount: deck.length,
      hand: hand.map((id, i): HandSlot => (revealed[i] ? { revealed: true, domino: id } : { revealed: false })),
    },
  };
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
