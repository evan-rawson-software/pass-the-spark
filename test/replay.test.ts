import { expect, test } from "vitest";
import { applyChoice } from "../src/engine/battle";
import type { Choice } from "../src/engine/battle";
import { enemies, newBattle, playRandomBattle } from "../scripts/randomPlay";

const f = (domino: string): Choice => ({ type: "opener", domino });
const a = (domino: string, spark: "Ember" | "Tide" | "Gale"): Choice => ({ type: "answer", domino, spark });

// Brute, seed 7, two players on the starter deck.
const script: Choice[] = [
  f("brace"), a("kindle", "Gale"), a("parry", "Tide"), a("brace", "Ember"), a("splash", "Tide"),
  f("parry"), a("kindle", "Gale"), a("lookout", "Ember"), a("splash", "Tide"),
];

function replay() {
  let s = newBattle("brute", 7);
  for (const c of script) s = applyChoice(s, c);
  return s;
}

test("replay: same seed and choices give identical final state and the stored summary", () => {
  const first = replay();
  expect(JSON.stringify(replay())).toBe(JSON.stringify(first));
  expect({
    result: first.result,
    round: first.round,
    partyHealth: first.party.health,
    enemyHealth: first.enemy.health,
  }).toEqual({ result: null, round: 2, partyHealth: 36, enemyHealth: 146 });
});

test("smoke: 50 random battles per enemy all end and never throw", () => {
  const maxSteps = 5000; // test safety limit; a battle that hits it fails
  for (const enemy of enemies) {
    for (let seed = 1; seed <= 50; seed++) {
      const r = playRandomBattle(enemy.id, seed, maxSteps);
      expect(r.result, `${enemy.id} seed ${seed} did not end`).not.toBeNull();
    }
  }
});
