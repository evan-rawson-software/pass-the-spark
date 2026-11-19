// Per-player views: the battle state with the enemy's hidden information removed.

import type { BattleState, EnemyState } from "./battle";
import { getRunWindow } from "./run";
import type { RunState } from "./run";

// A hand slot as the players see it: a revealed domino, or only a position.
export type HandSlot = { revealed: true; domino: string } | { revealed: false };

export interface EnemyView extends Omit<EnemyState, "deck" | "hand" | "revealed"> {
  deckList: string[]; // every domino in the enemy's deck, sorted (order hidden)
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
      hand: hand.map((id, i): HandSlot => (revealed[i] ? { revealed: true, domino: id } : { revealed: false })),
    },
  };
}

// The run as a player sees it. Everything in a run is open information (maps, decks, coins, offers,
// stock and votes), so the view is the same for every player. It leaves out the seeded RNG, the
// battle (battles have their own views) and the content, which every player already has.
// window names the decision the run is waiting on (see getRunWindow). Returns a copy.
export type RunView = Omit<RunState, "rng" | "battle" | "content"> & { window: string };

export function getRunView(run: RunState, playerId: string): RunView {
  if (!run.players.includes(playerId)) throw new Error("no such player " + playerId);
  const copy: RunState = JSON.parse(JSON.stringify(run));
  const { rng, battle, content, ...rest } = copy;
  return { ...rest, window: getRunWindow(run) };
}
