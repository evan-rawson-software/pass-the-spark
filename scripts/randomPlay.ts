// Plays battles with random legal choices, with the stock bot or with the planning bot, over the engine's public functions only.
// The seats take turns round-robin (scripts/seats.ts) until every seat is Ready. Random picks come from the engine's
// seeded RNG, so the same seed gives the same battle. Along the way it counts the options each turn offered and
// what each cascade looked like (for npm run sim).

import { createBattle, getPlayerChoices, step } from "../src/engine/battle";
import type { BattleState, Choice, PendingInput } from "../src/engine/battle";
import { nextInt } from "../src/engine/rng";
import { getView } from "../src/engine/view";
import { loadContent } from "../src/engine/content";
import { botChoice } from "./bot";
import { BEAM_WIDTH, createPlannerBot } from "./planner";
import { nextSeatChoice } from "./seats";
import type { BattleBot } from "./seats";

export const { config, dominoes, enemies, starterDeck } = loadContent();
const kindOf = new Map(dominoes.map((d) => [d.id, d.kind]));

export interface CascadeStats {
  nodes: number; // dominoes on the board
  junctions: number; // junctions among them (branch points)
  caps: number; // caps among them
  fizzled: number; // ends left uncapped
  damage: number; // damage that reached the enemy's health
  combo: number; // the combo total: every hit, before enemy block
  lineReached: boolean; // the combo total reached the enemy's line (the enemy was staggered)
  damageCaps: number; // damage caps that went off
  blockCaps: number; // block caps that went off
}

export interface BattleStats {
  result: "won" | "lost" | null; // null: stopped at the step cap
  rounds: number;
  turns: number; // seat turns taken (a placement or Ready)
  enemyHealth: number; // the enemy's health at the start
  healthLost: number; // party health lost over the battle (0 to max health)
  incoming: number; // what the enemy's attacks and passives hit the party for, before block: the loss of a party that blocked nothing
  turnsWithChoice: number; // turns with more than one distinct legal choice (plays and Ready together)
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

export type Player = "random" | "stock" | "planner";

// A random legal choice: a placement of a domino on an end, or Ready. Never a take-back, so a battle always ends.
const randomBot: BattleBot = (view, seat, rng) => {
  const options = legalOptions(view, seat);
  const r = nextInt(rng, options.length);
  return { choice: options[r.value], rng: r.state };
};

// Every distinct legal choice of a seat: each domino on each end (the opener has no end), and Ready.
function legalOptions(view: PendingInput, seat: string): Choice[] {
  const pending = getPlayerChoices(view, seat)!;
  const options: Choice[] = [{ type: "ready", player: seat, ready: true }];
  for (const o of pending.plays) {
    if (pending.opener) options.push({ type: "play", player: seat, domino: o.domino });
    else for (const end of o.ends) options.push({ type: "play", player: seat, domino: o.domino, end });
  }
  return options;
}

// Plays one battle with random legal choices, the stock bot or the planning bot. Stops after maxSteps choices.
export function playRandomBattle(enemyId: string, seed: number, maxSteps: number, player: Player = "random", partySize = 2, beam = BEAM_WIDTH): BattleStats {
  let state = newBattle(enemyId, seed, partySize);
  let pick = seed; // the picker's own RNG state
  const bot: BattleBot = player === "planner" ? createPlannerBot(beam) : player === "stock" ? botChoice : randomBot;
  const stats: BattleStats = {
    result: null, rounds: 0, turns: 0, enemyHealth: state.enemy.health, healthLost: 0, incoming: 0, turnsWithChoice: 0, turnsWithPlays: 0, choices: 0, playOptions: 0, cascades: [], steps: 0, final: state,
  };
  const fresh = (): CascadeStats => ({ nodes: 0, junctions: 0, caps: 0, fizzled: 0, damage: 0, combo: 0, lineReached: false, damageCaps: 0, blockCaps: 0 });
  let cascade = fresh();
  let last = -1; // the seat that acted last
  while (state.phase !== "over" && stats.steps < maxSteps) {
    const next = nextSeatChoice(state, last, bot, pick);
    last = next.seat;
    pick = next.rng;
    const options = legalOptions(state, next.player);
    stats.turns += 1;
    stats.choices += options.length;
    stats.playOptions += options.length - 1;
    if (options.length > 1) stats.turnsWithChoice += 1;
    if (options.length > 2) stats.turnsWithPlays += 1;

    const result = step(state, next.choice);
    state = result.state;
    stats.steps += 1;
    for (const e of result.events) {
      if (e.type === "play") {
        cascade.nodes += 1;
        const kind = kindOf.get(e.domino);
        if (kind === "junction") cascade.junctions += 1;
        if (kind === "cap") cascade.caps += 1;
      } else if (e.type === "fizzle") cascade.fizzled += 1;
      else if (e.type === "damage" && e.side === "party") stats.incoming += e.amount + e.blocked;
      else if (e.type === "damage" && e.side === "enemy") {
        cascade.damage += e.amount;
        cascade.combo += e.amount + e.blocked; // a hit before block
      } else if (e.type === "lineReached") cascade.lineReached = true;
      else if (e.type === "capFired" && e.effect === "damage") cascade.damageCaps += 1;
      else if (e.type === "capFired" && e.effect === "block") cascade.blockCaps += 1;
    }
    if (result.events.some((e) => e.type === "setOff")) {
      stats.cascades.push(cascade);
      cascade = fresh();
    }
  }
  stats.result = state.result;
  stats.rounds = state.round;
  stats.healthLost = state.party.maxHealth - Math.max(state.party.health, 0);
  stats.final = state;
  return stats;
}
