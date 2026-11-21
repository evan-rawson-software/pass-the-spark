import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import type { Content } from "../src/engine/content";
import { applyRunChoice, createRun, getPendingRunChoices } from "../src/engine/run";

test("Twin Forge: the weld has the first domino's intake, amplifier and upgrades, the second's output and the higher rarity", () => {
  const content = JSON.parse(JSON.stringify(loadContent())) as Content;
  for (const e of content.events) e.enabled = e.id === "twin_forge";
  content.run.acts[0].map.fixedFloors["1"] = "event";
  let run = createRun({ players: ["a", "b"], seed: 5, content });
  for (const id of ["a", "b"]) run = applyRunChoice(run, id, { type: "vote", node: 0 }).run;
  expect(run.event!.id).toBe("twin_forge");

  // a's first domino is an upgraded Ember Boost; the second is a rare amplifier with a Gale output.
  const first = run.decks.a.find((id) => id.startsWith("boost_ember#"))!;
  const second = run.decks.a.find((id) => id.startsWith("boost_tide_gale#"))!;
  const strike = run.decks.a.find((id) => id.startsWith("strike_ember#"))!;
  const junction = run.decks.a.find((id) => id.startsWith("junction_ember#"))!;
  const boost = run.dominoes.find((d) => d.id === first)!;
  boost.upgraded = ["right"];
  boost.amp!.value = 2;
  const other = run.dominoes.find((d) => d.id === second)!;
  other.rarity = "rare";
  const deckSize = run.decks.a.length;

  // Skip is always offered; a pick that isn't two different dominoes of the player's own deck is refused,
  // and only two amplifiers or two junctions can be welded.
  expect(() => applyRunChoice(run, "a", { type: "event", option: 1, pick: { dominoes: [first, first] } })).toThrow();
  expect(() => applyRunChoice(run, "a", { type: "event", option: 1, pick: { dominoes: [first, run.decks.b[0]] } })).toThrow();
  expect(() => applyRunChoice(run, "a", { type: "event", option: 1, pick: { dominoes: [first, strike] } })).toThrow();
  expect(() => applyRunChoice(run, "a", { type: "event", option: 1, pick: { dominoes: [first, junction] } })).toThrow();

  const welded = applyRunChoice(run, "a", { type: "event", option: 1, pick: { dominoes: [first, second] } }).run;
  expect(getPendingRunChoices(welded).map((p) => p.player)).toEqual(["b"]); // b is still choosing
  const added = welded.dominoes.find((d) => d.id === welded.decks.a[welded.decks.a.length - 1])!;
  expect(added).toMatchObject({ kind: "amplifier", intake: ["Ember"], output: other.output, amp: { op: "add", value: 2 }, upgraded: ["right"], rarity: "rare" });
  expect(welded.decks.a).toHaveLength(deckSize - 1);
  expect(welded.decks.a).not.toContain(first);
  expect(welded.decks.a).not.toContain(second);

  const done = applyRunChoice(welded, "b", { type: "event", option: 0 });
  expect(done.run.phase).not.toBe("event");
  expect(done.events.find((e) => e.type === "eventSummary")).toMatchObject({ results: [{ player: "a", action: "weld" }, { player: "b", action: "skip" }] });
});
