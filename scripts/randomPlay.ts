// Random play over the engine's public functions only. Random picks come from the
// engine's seeded RNG, so the same seed gives the same battle.
// Placeholder for the cascade rules: #183 rewrites the sims.

import { createBattle, step, getPendingChoice } from "../src/engine/battle";
import type { BattleState, Choice } from "../src/engine/battle";
import { nextInt } from "../src/engine/rng";
import { getView } from "../src/engine/view";
import { loadContent } from "../src/engine/content";
import { botChoice } from "./bot";

export const { config, dominoes, enemies, starterDeck } = loadContent();

export interface BattleStats {
  result: "won" | "lost" | null; // null: stopped at the step cap
  rounds: number;
  chains: number[]; // dominoes played on the board in each round
  playerAnswers: number[]; // the same list (there is no enemy play any more)
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
    seatOrder: ["p1", "p2"],
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
  let inRound = 0;
  let steps = 0;
  while (state.phase !== "over" && steps < maxSteps) {
    const pending = getPendingChoice(state);
    if (pending === null) break;
    let choice: Choice;
    if (player === "bot") {
      const b = botChoice(getView(state, pending.player), pending.player, pick);
      pick = b.rng;
      choice = b.choice;
    } else {
      // Random among passing, setting off and every legal play (each domino on each end).
      const options: Choice[] = [{ type: "pass" }];
      if (pending.canSetOff) options.push({ type: "setOff" });
      for (const o of pending.plays) {
        if (pending.opener) options.push({ type: "play", domino: o.domino });
        else for (const end of o.ends) options.push({ type: "play", domino: o.domino, end });
      }
      const r = nextInt(pick, options.length);
      pick = r.state;
      choice = options[r.value];
    }
    const round = state.round;
    const result = step(state, choice);
    state = result.state;
    steps += 1;
    for (const e of result.events) if (e.type === "play") inRound += 1;
    if (state.round !== round) {
      chains.push(inRound);
      inRound = 0;
    }
  }
  if (inRound > 0) chains.push(inRound);
  return { result: state.result, rounds: state.round, chains, playerAnswers: chains.slice(), steps, final: state };
}
