import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import type { Content } from "../src/engine/content";
import { SKIP } from "../src/engine/rewards";
import { pickEvent } from "../src/engine/eventStops";
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
    } else if (owed.type === "event") {
      r = applyRunChoice(run, owed.player, { type: "event", option: 0 });
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

test("a split vote resolves the same way for the same seed", () => {
  const content = loadContent();
  const split = (seed: number): number => {
    const run = createRun({ players: ["a", "b"], seed, content });
    const owed = getPendingRunChoices(run)[0];
    if (owed.type !== "vote") throw new Error("expected a vote");
    const [x, y] = owed.options;
    expect(() => applyRunChoice(run, "a", { type: "vote", node: 99 })).toThrow(); // not a node on floor 1
    const voted = applyRunChoice(run, "a", { type: "vote", node: x });
    const result = applyRunChoice(voted.run, "b", { type: "vote", node: y });
    expect(result.events.find((e) => e.type === "routeChosen")).toMatchObject({ counts: { [x]: 1, [y]: 1 }, drawn: true });
    return result.run.position!.index;
  };
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const results = seeds.map(split);
  expect(seeds.map(split)).toEqual(results);
  expect(new Set(results).size).toBe(2); // the RNG really chooses between the voted nodes
});

// A run whose first floor is an event stop, with everyone standing on it.
function atEvent(seed: number): RunState {
  const content = JSON.parse(JSON.stringify(loadContent())) as Content; // a copy: loadContent shares its data objects
  content.run.acts[0].map.fixedFloors["1"] = "event";
  for (const e of content.events) e.enabled = e.id === "lost_courier"; // these tests are about the courier
  let run = createRun({ players, seed, content });
  for (const id of players) run = applyRunChoice(run, id, { type: "vote", node: 0 }).run;
  return run;
}

function courierVote(seed: number, votes: number[]): { run: RunState; outcome: RunEvent } {
  let run = atEvent(seed);
  expect(run.phase).toBe("event");
  expect(run.event!.id).toBe("lost_courier");
  const events: RunEvent[] = [];
  players.forEach((id, i) => {
    const r = applyRunChoice(run, id, { type: "event", option: votes[i] });
    run = r.run;
    events.push(...r.events);
  });
  return { run, outcome: events.find((e) => e.type === "eventOutcome")! };
}

test("events don't repeat until every enabled one has been seen, and the pool skips disabled ones", () => {
  const content = JSON.parse(JSON.stringify(loadContent())) as Content;
  const on =["lost_courier", "toll_bridge", "spark_shrine"];
  for (const e of content.events) e.enabled = on.includes(e.id);
  let state = 11;
  let seen: string[] = [];
  const drawn: string[] = [];
  for (let i = 0; i < 9; i++) {
    const pick = pickEvent(state, content.events, seen);
    state = pick.state;
    seen = pick.seen;
    drawn.push(pick.id);
  }
  for (const round of [0, 3, 6]) expect(drawn.slice(round, round + 3).sort()).toEqual([...on].sort());
});

test("Lost Courier: the domino goes to the player chosen, and a split vote resolves the same way for the same seed", () => {
  // Everyone votes for player b: b gets the domino, nobody else's deck changes, and the stop is done.
  const unanimous = courierVote(1, [1, 1, 1]);
  const domino = unanimous.run.dominoes.find((d) => d.rarity === "rare")!;
  expect(unanimous.run.decks.b).toContain(domino.id);
  expect(unanimous.run.decks.a).not.toContain(domino.id);
  expect(unanimous.run.decks.c).not.toContain(domino.id);
  expect(unanimous.outcome).toMatchObject({ winner: 1, drawn: false });
  expect(unanimous.run.phase).toBe("vote");
  expect(unanimous.run.event).toBeNull();
  expect(unanimous.run.eventsSeen).toEqual(["lost_courier"]);

  // Coins for everyone.
  const coins = courierVote(1, [3, 3, 3]);
  const fee = coins.run.content.events.find((e) => e.id === "lost_courier")!.numbers.coinsEach;
  expect(coins.run.coins.a).toBe(coins.run.content.run.startingCoins + fee);

  // a votes for itself, b for c, c for coins: the draw is the same for the same seed, and the seeds differ.
  const winners = (): number[] => [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => (courierVote(seed, [0, 2, 3]).outcome as { winner: number }).winner);
  const first = winners();
  expect(winners()).toEqual(first);
  expect(new Set(first).size).toBeGreaterThan(1);
});
