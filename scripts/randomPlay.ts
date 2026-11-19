// Random play over the engine's public functions only. Random picks come from the
// engine's seeded RNG, so the same seed gives the same battle.

import { applyChoice, createBattle, getPendingChoice } from "../src/engine/battle";
import type { BattleState, Choice } from "../src/engine/battle";
import { nextInt } from "../src/engine/rng";
import { loadContent } from "../src/engine/content";

export const { config, dominoes, enemies, starterDeck } = loadContent();

export interface BattleStats {
  result: "won" | "lost" | null; // null: stopped at the step cap
  rounds: number;
  chains: number[]; // player dominoes played in each round's chain
  steps: number;
  final: BattleState;
}

export function newBattle(enemyId: string, seed: number): BattleState {
  return createBattle({
    config,
    content: { dominoes, enemies },
    players: [
      { id: "p1", deck: starterDeck },
      { id: "p2", deck: starterDeck },
    ],
    seatOrder: ["p1", "p2", "enemy"],
    enemyId,
    seed,
  });
}

// Plays one battle with random legal choices. Stops after maxSteps choices.
export function playRandomBattle(enemyId: string, seed: number, maxSteps: number): BattleStats {
  let state = newBattle(enemyId, seed);
  let pick = seed; // the picker's own RNG state
  const chains: number[] = [];
  let inRound = 0;
  let steps = 0;
  while (state.phase !== "over" && steps < maxSteps) {
    const pending = getPendingChoice(state);
    if (pending === null) break;
    let choice: Choice;
    if (pending.type === "fuse") {
      const r = nextInt(pick, pending.dominoes.length);
      pick = r.state;
      choice = { type: "fuse", domino: pending.dominoes[r.value] };
    } else {
      const r = nextInt(pick, pending.options.length);
      pick = r.state;
      const option = pending.options[r.value];
      const s = nextInt(pick, option.sparks.length);
      pick = s.state;
      choice = { type: "answer", domino: option.domino, spark: option.sparks[s.value] };
    }
    const round = state.round;
    state = applyChoice(state, choice);
    steps += 1;
    inRound += 1;
    if (state.round !== round) {
      chains.push(inRound);
      inRound = 0;
    }
  }
  if (inRound > 0) chains.push(inRound);
  return { result: state.result, rounds: state.round, chains, steps, final: state };
}
