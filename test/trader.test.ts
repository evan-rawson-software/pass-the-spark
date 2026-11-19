import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import { applyRunChoice, createRun, getPendingRunChoices } from "../src/engine/run";
import type { RunChoice, RunState } from "../src/engine/run";

const trade = (run: RunState, player: string, action: Extract<RunChoice, { type: "trader" }>["action"]) =>
  applyRunChoice(run, player, { type: "trader", action }).run;

test("Trader: buy, then remove twice. Coins drop by the right amounts and the fee rises", () => {
  const content = loadContent();
  content.run.startingCoins = 100;
  content.run.trader.rarityOdds = { common: 1, uncommon: 0, rare: 0 };
  let run = createRun({ players: ["a", "b"], seed: 3, content });
  for (const node of run.map.floors[0]) node.type = "trader"; // make the first stop a Trader
  for (const id of run.players) run = applyRunChoice(run, id, { type: "vote", node: 0 }).run;
  expect(run.phase).toBe("trader");

  const { prices, removalFeeStart, removalFeeStep, stockSize } = content.run.trader;
  const stock = run.trader!.stock.a;
  expect(stock).toHaveLength(stockSize);
  const deckSize = run.decks.a.length;

  run = trade(run, "a", { kind: "buy", domino: stock[0].id });
  expect(run.coins.a).toBe(100 - prices.common);
  expect(run.decks.a).toContain(stock[0].id);
  expect(() => trade(run, "a", { kind: "buy", domino: stock[0].id })).toThrow(); // bought already
  expect(() => trade(run, "a", { kind: "buy", domino: run.trader!.stock.b[0].id })).toThrow(); // b's stock

  run = trade(run, "a", { kind: "remove", domino: run.decks.a[0] });
  run = trade(run, "a", { kind: "remove", domino: run.decks.a[0] });
  expect(run.coins.a).toBe(100 - prices.common - removalFeeStart - (removalFeeStart + removalFeeStep));
  expect(run.removalFee.a).toBe(removalFeeStart + 2 * removalFeeStep);
  expect(run.removalFee.b).toBe(removalFeeStart); // fees are personal
  expect(run.decks.a).toHaveLength(deckSize - 1);

  run = trade(run, "a", { kind: "done" });
  expect(run.phase).toBe("trader"); // b isn't done yet
  run = trade(run, "b", { kind: "done" });
  expect(run.phase).not.toBe("trader");
  expect(getPendingRunChoices(run).every((p) => p.type !== "trader")).toBe(true);
});
