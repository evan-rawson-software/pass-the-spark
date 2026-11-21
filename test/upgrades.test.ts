import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import { applyRunChoice, createRun } from "../src/engine/run";
import type { RunState } from "../src/engine/run";

// A rest site where nobody has chosen yet.
function restSite(run: RunState): RunState {
  return { ...run, phase: "rest", rest: [] };
}

test("upgrading both sides of a Strike copy changes only that copy, and a third upgrade is rejected", () => {
  const start = createRun({ players: ["a", "b"], seed: 1, content: loadContent() });
  const first = restSite(start);
  const copy = first.decks.a.find((id) => id.startsWith("strike_ember#"))!;
  const other = first.decks.a.find((id) => id.startsWith("strike_tide#"))!;

  // Wrong spark (the original) and another player's domino are rejected.
  expect(() => applyRunChoice(first, "a", { type: "upgrade", domino: copy, side: "left", spark: "Ember" })).toThrow();
  expect(() => applyRunChoice(first, "b", { type: "upgrade", domino: copy, side: "right" })).toThrow();

  // One upgrade per player per rest site, so the second side is a second rest site.
  const left = applyRunChoice(first, "a", { type: "upgrade", domino: copy, side: "left", spark: "Tide" }).run;
  const right = applyRunChoice(restSite(left), "a", { type: "upgrade", domino: `${copy}+L`, side: "right" }).run;

  const upgraded = right.dominoes.find((d) => d.id === `${copy}+L+R`)!;
  expect(upgraded).toMatchObject({ name: "Ember Strike+", intake: ["Ember", "Tide"], output: [], effect: { kind: "damage", base: 11 } });
  expect(right.decks.a).toEqual(first.decks.a.map((id) => (id === copy ? `${copy}+L+R` : id)));
  expect(right.dominoes.find((d) => d.id === other)).toEqual(first.dominoes.find((d) => d.id === other)); // the other Strike is untouched

  // Both sides are used: a third upgrade of either side is rejected.
  const again = restSite(right);
  expect(() => applyRunChoice(again, "a", { type: "upgrade", domino: `${copy}+L+R`, side: "right" })).toThrow();
  expect(() => applyRunChoice(again, "a", { type: "upgrade", domino: `${copy}+L+R`, side: "left", spark: "Gale" })).toThrow();

  // The run moves on once everyone has chosen.
  const waiting = applyRunChoice(again, "a", { type: "rest" }).run;
  expect(waiting.phase).toBe("rest");
  expect(applyRunChoice(waiting, "b", { type: "rest" }).run.phase).not.toBe("rest");
});
