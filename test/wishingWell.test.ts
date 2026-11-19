import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import type { Content } from "../src/engine/content";
import { applyRunChoice, createRun, getPendingRunChoices } from "../src/engine/run";
import type { RunState } from "../src/engine/run";
import type { Spark } from "../src/engine/types";
import { validateEvents } from "../src/engine/validate-events";
import eventsJson from "../data/events.json";

function wellRun(seed: number): RunState {
  const content = JSON.parse(JSON.stringify(loadContent())) as Content;
  for (const e of content.events) e.enabled = e.id === "wishing_well";
  content.run.acts[0].map.fixedFloors["1"] = "event";
  let run = createRun({ players: ["a", "b"], seed, content });
  for (const id of ["a", "b"]) run = applyRunChoice(run, id, { type: "vote", node: 0 }).run;
  expect(run.event!.id).toBe("wishing_well");
  return run;
}

// Every domino in the player's deck gives off these sparks, so the turned one is known.
function setOutputs(run: RunState, player: string, output: Spark[]): void {
  for (const id of run.decks[player]) run.dominoes.find((d) => d.id === id)!.output = output.slice();
}

test("Wishing Well: Tide removes a domino free; two outputs let the player pick, and Storm offers rares", () => {
  const run = wellRun(7);
  setOutputs(run, "a", ["Tide"]);
  setOutputs(run, "b", ["Ember", "Storm"]);
  const coins = run.coins.a;
  const size = run.decks.a.length;

  // Turning over takes no pick.
  expect(() => applyRunChoice(run, "a", { type: "event", option: 1, pick: { dominoes: [] } })).toThrow();
  let r = applyRunChoice(run, "a", { type: "event", option: 1 }).run;
  expect(getPendingRunChoices(r).map((p) => p.player)).toEqual(["a", "b"]); // a still owes the removal
  expect(r.event!.wells!.a.spark).toBe("Tide");
  expect(() => applyRunChoice(r, "a", { type: "event", option: 1, pick: { dominoes: [r.decks.b[0]] } })).toThrow();
  const removed = r.decks.a[0];
  r = applyRunChoice(r, "a", { type: "event", option: 1, pick: { dominoes: [removed] } }).run;
  expect(r.decks.a).toHaveLength(size - 1);
  expect(r.decks.a).not.toContain(removed);
  expect(r.coins.a).toBe(coins);

  // b's domino has two outputs: pick Storm, then take one of the three rares.
  r = applyRunChoice(r, "b", { type: "event", option: 1 }).run;
  expect(r.event!.wells!.b.spark).toBeNull();
  expect(() => applyRunChoice(r, "b", { type: "event", option: 1, pick: { dominoes: [], spark: "Gale" } })).toThrow();
  r = applyRunChoice(r, "b", { type: "event", option: 1, pick: { dominoes: [], spark: "Storm" } }).run;
  const offers = r.event!.wells!.b.offers!;
  expect(offers).toHaveLength(3);
  expect(offers.every((d) => d.rarity === "rare")).toBe(true);
  const done = applyRunChoice(r, "b", { type: "event", option: 1, pick: { dominoes: [], offer: offers[1].id } });
  expect(done.run.decks.b).toContain(offers[1].id);
  expect(done.events.find((e) => e.type === "eventSummary")).toMatchObject({ results: [{ player: "a", action: "wish", wish: { prize: "remove" } }, { player: "b", action: "wish", wish: { prize: "rare" } }] });
});

test("Wishing Well: Gale pays coins when nothing can be upgraded; the same seed turns over the same domino", () => {
  const run = wellRun(3);
  setOutputs(run, "a", ["Gale"]);
  for (const id of run.decks.a) run.dominoes.find((d) => d.id === id)!.upgraded = ["left", "right"];
  const coins = run.coins.a;
  const first = applyRunChoice(run, "a", { type: "event", option: 1 }).run;
  const again = applyRunChoice(run, "a", { type: "event", option: 1 }).run;
  expect(first.event!.results!.a.wish).toMatchObject({ prize: "coins", coins: 30 });
  expect(first.coins.a).toBe(coins + 30);
  expect(again.event!.results!.a.wish!.turned.id).toBe(first.event!.results!.a.wish!.turned.id);
});

test("the validator wants a prize for every basic and advanced spark", () => {
  const content = loadContent();
  const data = JSON.parse(JSON.stringify(eventsJson));
  delete data.events.find((e: { id: string }) => e.id === "wishing_well").prizes.Void;
  expect(() => validateEvents(data, content.pools)).toThrow(/Void/);
});
