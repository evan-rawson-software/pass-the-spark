import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import { openTollBridge } from "../src/engine/events/tollBridge";
import { applyRunChoice, createRun } from "../src/engine/run";
import type { RunState } from "../src/engine/run";
import { getRunView } from "../src/engine/view";

// A run standing at the Toll Bridge on floor 3, with the event open.
function atBridge(coins: number[]): RunState {
  const content = loadContent();
  const run = createRun({ players: ["a", "b", "c"], seed: 5, content });
  const floor = 3;
  run.position = { floor, index: 0, type: "event" };
  run.map.floors[floor - 1][0].next = [0, 1];
  run.phase = "event";
  run.votes = {};
  ["a", "b", "c"].forEach((id, i) => (run.coins[id] = coins[i]));
  const data = content.events.find((e) => e.id === "toll_bridge")!;
  run.event = openTollBridge(data, run.coins, run.players);
  return run;
}

test("Pay is only offered when everyone can afford it", () => {
  expect(atBridge([20, 20, 20]).event!.options.map((o) => o.type === "toll" && o.action)).toEqual(["pay", "fight", "turnBack"]);
  expect(atBridge([20, 14, 20]).event!.options.map((o) => o.type === "toll" && o.action)).toEqual(["fight", "turnBack"]);
});

test("Turn back hides the next floor, and entering a stop clears it", () => {
  let run = atBridge([20, 20, 20]);
  const real = run.map.floors[3].map((n) => n.type);
  for (const id of run.players) run = applyRunChoice(run, id, { type: "event", option: 2 }).run;
  expect(run.phase).toBe("vote");
  expect(run.hiddenFloor).toBe(4);
  // Players are not told the real types; the engine still knows them.
  const view = getRunView(run, "a");
  expect(new Set(view.map.floors[3].map((n) => n.type))).toEqual(new Set(["event"]));
  expect(run.map.floors[3].map((n) => n.type)).toEqual(real);
  // Voting for a stop on the hidden floor enters it and reveals it.
  for (const id of run.players) run = applyRunChoice(run, id, { type: "vote", node: 0 }).run;
  expect(run.hiddenFloor).toBeNull();
  expect(run.position).toMatchObject({ floor: 4, index: 0, type: real[0] });
});
