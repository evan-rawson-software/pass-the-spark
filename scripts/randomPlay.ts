// Random play over the engine's public functions only. Random picks come from the
// engine's seeded RNG, so the same seed gives the same battle.

import { createBattle, step, getPendingChoice, ENEMY_SEAT } from "../src/engine/battle";
import type { BattleState, Choice } from "../src/engine/battle";
import { nextInt } from "../src/engine/rng";
import { getView } from "../src/engine/view";
import { loadContent } from "../src/engine/content";
import { botChoice } from "./bot";

export const { config, dominoes, enemies, starterDeck } = loadContent();

export interface BattleStats {
  result: "won" | "lost" | null; // null: stopped at the step cap
  rounds: number;
  chains: number[]; // answers (player and enemy) in each round's chain, not the opener
  playerAnswers: number[]; // player answers only in each round, not the opener or enemy reactions
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

export type Player = "random" | "bot";

// Plays one battle with random legal choices, or with the bot. Stops after maxSteps choices.
export function playRandomBattle(enemyId: string, seed: number, maxSteps: number, player: Player = "random"): BattleStats {
  let state = newBattle(enemyId, seed);
  let pick = seed; // the picker's own RNG state
  const chains: number[] = [];
  const playerAnswers: number[] = [];
  let inRound = 0;
  let playerInRound = 0;
  let steps = 0;
  while (state.phase !== "over" && steps < maxSteps) {
    const pending = getPendingChoice(state);
    if (pending === null) break;
    let choice: Choice;
    if (player === "bot") {
      const b = botChoice(getView(state, pending.player), pending.player, pick);
      pick = b.rng;
      choice = b.choice;
    } else if (pending.type === "opener") {
      const r = nextInt(pick, pending.dominoes.length);
      pick = r.state;
      choice = { type: "opener", domino: pending.dominoes[r.value] };
    } else {
      const r = nextInt(pick, pending.options.length);
      pick = r.state;
      const option = pending.options[r.value];
      const s = nextInt(pick, option.sparks.length);
      pick = s.state;
      choice = { type: "answer", domino: option.domino, spark: option.sparks[s.value] };
    }
    const round = state.round;
    const result = step(state, choice);
    state = result.state;
    steps += 1;
    for (const e of result.events) {
      if (e.type !== "play") continue;
      inRound += 1;
      if (e.seat !== ENEMY_SEAT) playerInRound += 1;
    }
    if (state.round !== round) {
      chains.push(inRound);
      playerAnswers.push(playerInRound);
      inRound = 0;
      playerInRound = 0;
    }
  }
  if (inRound > 0) {
    chains.push(inRound);
    playerAnswers.push(playerInRound);
  }
  return { result: state.result, rounds: state.round, chains, playerAnswers, steps, final: state };
}
