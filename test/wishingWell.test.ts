import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import type { Content } from "../src/engine/content";
import { applyRunChoice, createRun } from "../src/engine/run";
import type { RunState } from "../src/engine/run";
import { validateEvents } from "../src/engine/validate-events";
import eventsJson from "../data/events.json";

function wellRun(seed: number): RunState {
  const content = JSON.parse(JSON.stringify(loadContent())) as Content;
  for (const e of content.events) e.enabled = e.id === "wishing_well";
  content.run.acts[0].map.fixedFloors["1"] = "event";
  let run = createRun({ players: ["a", "b"], seed, content });
  for (const id of ["a", "b"]) run = applyRunChoice(run, id, { type: "vote", node: 0 }).run;
  return run;
}

test("Wishing Well: Tide with the deck at its minimum size pays the fallback coins instead of a removal", () => {
  const run = wellRun(7);
  run.content.run.trader.minDeckSize = run.decks.a.length;
  for (const id of run.decks.a) run.dominoes.find((d) => d.id === id)!.output = ["Tide"];
  const coins = run.coins.a;
  const size = run.decks.a.length;
  const r = applyRunChoice(run, "a", { type: "event", option: 1 }).run;
  expect(r.event!.results!.a.wish).toMatchObject({ prize: "coins", coins: 30 });
  expect(r.coins.a).toBe(coins + 30);
  expect(r.decks.a).toHaveLength(size);
});

test("the validator wants a prize for every basic and advanced spark", () => {
  const content = loadContent();
  const data = JSON.parse(JSON.stringify(eventsJson));
  delete data.events.find((e: { id: string }) => e.id === "wishing_well").prizes.Void;
  expect(() => validateEvents(data, content.pools)).toThrow(/Void/);
});
