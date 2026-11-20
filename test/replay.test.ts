import { expect, test } from "vitest";
import { enemies, playRandomBattle } from "../scripts/randomPlay";

test("replay: the same seed and choices give an identical final state", () => {
  const first = playRandomBattle("brute", 7, 5000);
  const second = playRandomBattle("brute", 7, 5000);
  expect(first.result).not.toBeNull();
  expect(JSON.stringify(second.final)).toBe(JSON.stringify(first.final));
  expect(second.steps).toBe(first.steps);
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
