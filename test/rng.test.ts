import { expect, test } from "vitest";
import { nextUint32, shuffle } from "../src/engine/rng";

test("a fixed seed produces fixed values", () => {
  const a = nextUint32(1);
  const b = nextUint32(a.state);
  const c = nextUint32(b.state);
  expect([a.value, b.value, c.value]).toEqual([2693262067, 11749833, 2265367787]);
});

test("shuffling a fixed list with a fixed seed gives a fixed order", () => {
  const r = shuffle(12345, [1, 2, 3, 4, 5, 6, 7, 8]);
  expect(r.value).toEqual([4, 1, 2, 6, 5, 7, 3, 8]);
});
