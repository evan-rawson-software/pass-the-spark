// Plays battles with random legal choices, or with the bot, over the engine's public functions only.
// Random picks come from the engine's seeded RNG, so the same seed gives the same battle. Along the
// way it counts the options each turn offered and what each cascade looked like (for npm run sim).

import { createBattle, step, getPendingChoice } from "../src/engine/battle";
import type { BattleState, Choice } from "../src/engine/battle";
import { nextInt } from "../src/engine/rng";
import { getView } from "../src/engine/view";
import { loadContent } from "../src/engine/content";
import { botChoice } from "./bot";

export const { config, dominoes, enemies, starterDeck } = loadContent();
const kindOf = new Map(dominoes.map((d) => [d.id, d.kind]));

export interface CascadeStats {
  nodes: number; // dominoes on the board
  junctions: number; // junctions among them (branch points)
  caps: number; // caps among them
  fizzled: number; // ends left uncapped
  damage: number; // damage that reached the enemy's health
  damageCaps: number; // damage caps that went off
  blockCaps: number; // block caps that went off
  ended: "capped" | "player" | "passes"; // every end capped, a player set it off, or everyone passed
}

export interface BattleStats {
  result: "won" | "lost" | null; // null: stopped at the step cap
  rounds: number;
  turns: number; // player turns taken
  turnsWithChoice: number; // turns with more than one distinct legal choice (plays, pass and set off together)
  turnsWithPlays: number; // turns with more than one distinct play (domino x end)
  choices: number; // distinct legal choices summed over all turns
  playOptions: number; // distinct plays summed over all turns
  cascades: CascadeStats[];
  steps: number;
  final: BattleState;
}

export function newBattle(enemyId: string, seed: number, partySize: number): BattleState {
  const ids = Array.from({ length: partySize }, (_, i) => "p" + (i + 1));
  return createBattle({
    config,
    content: { dominoes, enemies },
    players: ids.map((id) => ({ id, deck: starterDeck })),
    seatOrder: ids,
    enemyId,
    seed,
  });
}

export type Player = "random" | "bot";

// Plays one battle with random legal choices, or with the bot. Stops after maxSteps choices.
export function playRandomBattle(enemyId: string, seed: number, maxSteps: number, player: Player = "random", partySize = 2): BattleStats {
  let state = newBattle(enemyId, seed, partySize);
  let pick = seed; // the picker's own RNG state
  const stats: BattleStats = {
    result: null, rounds: 0, turns: 0, turnsWithChoice: 0, turnsWithPlays: 0, choices: 0, playOptions: 0, cascades: [], steps: 0, final: state,
  };
  const fresh = (): CascadeStats => ({ nodes: 0, junctions: 0, caps: 0, fizzled: 0, damage: 0, damageCaps: 0, blockCaps: 0, ended: "capped" });
  let cascade = fresh();
  while (state.phase !== "over" && stats.steps < maxSteps) {
    const pending = getPendingChoice(state);
    if (pending === null) break;
    // Every distinct legal choice: each domino on each end (the opener has no end), pass, and set off.
    const options: Choice[] = [{ type: "pass" }];
    if (pending.canSetOff) options.push({ type: "setOff" });
    let plays = 0;
    for (const o of pending.plays) {
      if (pending.opener) {
        options.push({ type: "play", domino: o.domino });
        plays += 1;
      } else {
        for (const end of o.ends) options.push({ type: "play", domino: o.domino, end });
        plays += o.ends.length;
      }
    }
    stats.turns += 1;
    stats.choices += options.length;
    stats.playOptions += plays;
    if (options.length > 1) stats.turnsWithChoice += 1;
    if (plays > 1) stats.turnsWithPlays += 1;

    let choice: Choice;
    if (player === "bot") {
      const b = botChoice(getView(state, pending.player), pending.player, pick);
      pick = b.rng;
      choice = b.choice;
    } else {
      const r = nextInt(pick, options.length);
      pick = r.state;
      choice = options[r.value];
    }
    const result = step(state, choice);
    state = result.state;
    stats.steps += 1;
    for (const e of result.events) {
      if (e.type === "play") {
        cascade.nodes += 1;
        const kind = kindOf.get(e.domino);
        if (kind === "junction") cascade.junctions += 1;
        if (kind === "cap") cascade.caps += 1;
      } else if (e.type === "fizzle") cascade.fizzled += 1;
      else if (e.type === "damage" && e.side === "enemy") cascade.damage += e.amount;
      else if (e.type === "capFired" && e.effect === "damage") cascade.damageCaps += 1;
      else if (e.type === "capFired" && e.effect === "block") cascade.blockCaps += 1;
      else if (e.type === "setOff") cascade.ended = e.reason === "player" ? "player" : e.reason === "passes" ? "passes" : "capped";
    }
    if (result.events.some((e) => e.type === "setOff")) {
      stats.cascades.push(cascade);
      cascade = fresh();
    }
  }
  stats.result = state.result;
  stats.rounds = state.round;
  stats.final = state;
  return stats;
}
