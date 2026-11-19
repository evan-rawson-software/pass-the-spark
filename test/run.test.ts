import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import { SKIP } from "../src/engine/rewards";
import { applyRunChoice, createRun, getPendingRunChoices } from "../src/engine/run";
import type { RunEvent, RunState } from "../src/engine/run";

const players = ["a", "b", "c"];

// Weaker enemies, so the plain "first legal move" play below wins its battles.
function easyContent() {
  const content = loadContent();
  for (const e of content.enemies) if (e.tier === "basic") e.maxHealth = 200;
  return content;
}

// Everyone votes for the first node, skips rewards and plays the first legal move in battles,
// until stop says to halt. Returns the events seen on the way.
function play(start: RunState, stop: (run: RunState) => boolean): { run: RunState; events: RunEvent[] } {
  let run = start;
  const events: RunEvent[] = [];
  while (run.phase !== "over" && !stop(run)) {
    const owed = getPendingRunChoices(run)[0];
    let r;
    if (owed.type === "vote") {
      r = applyRunChoice(run, owed.player, { type: "vote", node: owed.options[0] });
    } else if (owed.type === "reward") {
      r = applyRunChoice(run, owed.player, { type: "reward", pick: SKIP });
    } else if (owed.type === "rest") {
      r = applyRunChoice(run, owed.player, { type: "rest" });
    } else if (owed.type === "trader") {
      r = applyRunChoice(run, owed.player, { type: "trader", action: { kind: "done" } });
    } else {
      const p = owed.pending;
      const choice =
        p.type === "opener"
          ? { type: "opener" as const, domino: p.dominoes[0] }
          : { type: "answer" as const, domino: p.options[0].domino, spark: p.options[0].sparks[0] };
      r = applyRunChoice(run, owed.player, { type: "battle", choice });
    }
    run = r.run;
    events.push(...r.events);
  }
  return { run, events };
}

test("two battles: health carries over, seats rotate and the lead carries over", () => {
  const start = createRun({ players, seed: 5, content: easyContent() });

  const first = play(start, (r) => r.battle !== null).run;
  expect(first.battle!.seatOrder).toEqual(["a", "b", "c", "enemy"]);
  expect(first.battle!.lead).toBe("a");
  expect(first.battle!.party.health).toBe(first.maxHealth);

  const afterFirst = play(first, (r) => r.phase === "reward").run;
  expect(afterFirst.phase).toBe("reward"); // won the first battle
  expect(afterFirst.health).toBeLessThan(afterFirst.maxHealth); // and it cost something
  const { startingCoins, battleCoins } = afterFirst.content.run;
  expect(afterFirst.coins.a).toBe(startingCoins + battleCoins.fight);
  // The next lead is whoever follows the last round's lead, not simply seat 1.
  const carriedLead = afterFirst.lead;

  const second = play(afterFirst, (r) => r.battle !== null).run;
  expect(second.battle!.seatOrder).toEqual(["b", "c", "a", "enemy"]); // one seat on, enemy still last
  expect(second.battle!.lead).toBe(carriedLead); // the rotation didn't change who leads
  expect(second.battle!.party.health).toBe(afterFirst.health); // health carried over
  expect(second.battle!.round).toBe(1);

  const afterSecond = play(second, (r) => r.phase !== "battle").run;
  expect(afterSecond.health).toBeLessThanOrEqual(afterFirst.health);

  // Same seed and choices, same run.
  const replay = play(play(start, (r) => r.phase === "reward").run, (r) => r.phase !== "battle" && r.battlesFought === 2).run;
  expect(JSON.stringify(replay)).toBe(JSON.stringify(afterSecond));
});

test("a tied vote resolves the same way for the same seed", () => {
  const content = loadContent();
  const tie = (seed: number): number => {
    const run = createRun({ players: ["a", "b"], seed, content });
    const owed = getPendingRunChoices(run)[0];
    if (owed.type !== "vote") throw new Error("expected a vote");
    const [x, y] = owed.options;
    expect(() => applyRunChoice(run, "a", { type: "vote", node: 99 })).toThrow(); // not a node on floor 1
    const voted = applyRunChoice(run, "a", { type: "vote", node: x });
    const result = applyRunChoice(voted.run, "b", { type: "vote", node: y });
    expect(result.events.find((e) => e.type === "routeChosen")).toMatchObject({ tied: [x, y] });
    return result.run.position!.index;
  };
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const results = seeds.map(tie);
  expect(seeds.map(tie)).toEqual(results);
  expect(new Set(results).size).toBe(2); // the RNG really chooses between the tied nodes
});
