import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import type { Content } from "../src/engine/content";
import { applyRunChoice, createRun, getPendingRunChoices } from "../src/engine/run";

test("Twin Forge: the weld has the first domino's intake, effect and upgrades, the second's output and the higher rarity", () => {
  const content = JSON.parse(JSON.stringify(loadContent())) as Content;
  for (const e of content.events) e.enabled = e.id === "twin_forge";
  content.run.acts[0].map.fixedFloors["1"] = "event";
  let run = createRun({ players: ["a", "b"], seed: 5, content });
  for (const id of ["a", "b"]) run = applyRunChoice(run, id, { type: "vote", node: 0 }).run;
  expect(run.event!.id).toBe("twin_forge");

  // a's first domino is an upgraded Jab (Ember to Tide); the second is a rare with a Storm output.
  const [first, second] = run.decks.a.filter((id) => id.startsWith("jab#") || id.startsWith("prism#"));
  const jab = run.dominoes.find((d) => d.id === first)!;
  jab.upgraded = ["right"];
  jab.effect.base = 5;
  const prism = run.dominoes.find((d) => d.id === second)!;
  prism.rarity = "rare";
  const deckSize = run.decks.a.length;

  // Skip is always offered; a pick that isn't two different dominoes of the player's own deck is refused.
  expect(() => applyRunChoice(run, "a", { type: "event", option: 1, pick: { dominoes: [first, first] } })).toThrow();
  expect(() => applyRunChoice(run, "a", { type: "event", option: 1, pick: { dominoes: [first, run.decks.b[0]] } })).toThrow();

  const welded = applyRunChoice(run, "a", { type: "event", option: 1, pick: { dominoes: [first, second] } }).run;
  expect(getPendingRunChoices(welded).map((p) => p.player)).toEqual(["b"]); // b is still choosing
  const added = welded.dominoes.find((d) => d.id === welded.decks.a[welded.decks.a.length - 1])!;
  expect(added).toMatchObject({ intake: ["Ember"], output: prism.output, effect: { kind: "damage", base: 5 }, upgraded: ["right"], rarity: "rare" });
  expect(welded.decks.a).toHaveLength(deckSize - 1);
  expect(welded.decks.a).not.toContain(first);
  expect(welded.decks.a).not.toContain(second);

  const done = applyRunChoice(welded, "b", { type: "event", option: 0 });
  expect(done.run.phase).not.toBe("event");
  expect(done.events.find((e) => e.type === "eventSummary")).toMatchObject({ results: [{ player: "a", action: "weld" }, { player: "b", action: "skip" }] });
});
