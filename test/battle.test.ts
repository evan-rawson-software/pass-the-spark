import { expect, test } from "vitest";
import { applyChoice, createBattle, getPlayerChoices, previewCascade, previewPlay, previewSetOff, step } from "../src/engine/battle";
import type { BattleState, StepResult } from "../src/engine/battle";
import { getView } from "../src/engine/view";
import type { Domino, Enemy } from "../src/engine/types";
import { loadContent } from "../src/engine/content";

const content = loadContent();

// Test-only dominoes for the older cascade scenarios below.
const doubleTide: Domino = { id: "double_tide", name: "Tide Double", kind: "amplifier", intake: ["Tide"], output: ["Ember"], amp: { op: "mul", value: 2 } };
const strike4: Domino = { id: "strike4_ember", name: "Ember Strike 4", kind: "cap", intake: ["Ember"], output: [], effect: { kind: "damage", base: 4 } };
const echoTide: Domino = { id: "echo_tide", name: "Tide Echo", kind: "amplifier", intake: ["Tide"], output: ["Tide"], amp: { op: "echo", value: 1 } };
const spectrumGale: Domino = { id: "spectrum_gale", name: "Gale Spectrum", kind: "amplifier", intake: ["Gale"], output: ["Gale"], amp: { op: "spectrum", value: 1 } };
const dominoes = [...content.dominoes, doubleTide, strike4, echoTide, spectrumGale];

// A test enemy that makes one attack of `attack` every round. Its line is out of reach unless a test sets one.
function dummy(attack: number, passives: Enemy["passives"] = [], maxHealth = 100, line = 100000): Enemy {
  return {
    id: "dummy",
    name: "Dummy",
    tier: "basic",
    maxHealth,
    line,
    intents: [{ id: "hit", actions: [{ kind: "attack", value: attack }] }],
    pattern: { type: "cycle", order: ["hit"] },
    passives,
  };
}

// Players a, b, c against the dummy, which attacks for 12 every round. Hands are set to known dominoes.
function setup(hands: string[][], attack = 12, passives: Enemy["passives"] = [], config = content.config): BattleState {
  const state = createBattle({
    config,
    content: { dominoes, enemies: [dummy(attack, passives)] },
    players: ["a", "b", "c"].map((id) => ({ id, deck: content.starterDeck })),
    seatOrder: ["a", "b", "c"],
    enemyId: "dummy",
    seed: 1,
  });
  hands.forEach((hand, i) => (state.players[i].hand = hand));
  return state;
}

function play(s: BattleState, player: string, domino: string, end?: number): BattleState {
  return applyChoice(s, { type: "play", player, domino, end });
}

function takeBack(s: BattleState, player: string, node: number): BattleState {
  return applyChoice(s, { type: "takeBack", player, node });
}

function ready(s: BattleState, player: string, value = true): BattleState {
  return applyChoice(s, { type: "ready", player, ready: value });
}

// Every player sets Ready, the first ones in turn; the step of the last one is returned (it fires the cascade).
function fire(s: BattleState): StepResult {
  const ids = s.seatOrder;
  for (const id of ids.slice(0, -1)) s = ready(s, id);
  return step(s, { type: "ready", player: ids[ids.length - 1], ready: true });
}

test("worked example (design.md): 4 players build at once in an interleaved order; every domino hits, 143 combo total crosses the line of 120, the staggered attack is absorbed, next round's hands", () => {
  const ogre = dummy(20, [], 340, 120);
  const s0 = createBattle({
    config: content.config,
    content: { dominoes: content.dominoes, enemies: [ogre] },
    players: ["ana", "ben", "cy", "dee"].map((id) => ({ id, deck: content.starterDeck })),
    seatOrder: ["ana", "ben", "cy", "dee"],
    enemyId: "dummy",
    seed: 3,
  });
  expect(s0.players.map((p) => [p.placements, p.hand.length])).toEqual([[3, 5], [3, 5], [3, 5], [3, 5]]); // 12 placements split 3 each; hand size 3 + 2
  const hands = [
    ["boost_gale_ember", "boost_ember", "strike_ember", "boost_tide", "guard_tide"], // ana
    ["boost_ember_tide", "boost_tide", "strike_tide", "guard_tide", "strike_gale"], // ben
    ["boost_tide_gale", "junction_ember", "guard_gale", "boost_ember", "strike_tide"], // cy
    ["junction_gale", "junction_tide", "strike_gale", "junction_ember", "boost_ember_tide"], // dee
  ];
  hands.forEach((hand, i) => (s0.players[i].hand = hand));
  const nextDraws = s0.players.map((p) => p.deck.slice(0, 3));

  // The build, interleaved across the players.
  let s = play(s0, "ana", "boost_gale_ember"); // the opener: charge 2, Ember out (end 0)
  s = play(s, "ben", "boost_ember_tide", 0); // 3, Tide (end 1)
  s = play(s, "cy", "boost_tide_gale", 1); // 4, Gale (end 2)
  s = play(s, "dee", "junction_gale", 2); // Ember (end 3) and Tide (end 4), both at 4
  s = play(s, "ben", "boost_tide", 4); // 5, Tide (end 5)
  s = play(s, "ana", "boost_ember", 3); // 5, Ember (end 6)
  s = play(s, "dee", "junction_tide", 5); // Gale (end 7) and Ember (end 8) at 5
  s = play(s, "cy", "junction_ember", 6); // Tide (end 9) and Gale (end 10) at 5
  expect(getView(s, "ana").openEnds.map((e) => [e.end, e.spark, e.charge])).toEqual([[7, "Gale", 5], [8, "Ember", 5], [9, "Tide", 5], [10, "Gale", 5]]);
  expect(previewPlay(s, "ben", "strike_tide", 9)).toMatchObject({ value: 35 });
  s = play(s, "ben", "strike_tide", 9);
  s = play(s, "dee", "strike_gale", 7);
  s = play(s, "cy", "guard_gale", 10);
  expect(previewCascade(s)).toEqual({ damage: 103, block: 25, comboTotal: 103, lineReached: false }); // the Ember strike is not on yet
  s = play(s, "ana", "strike_ember", 8);

  expect(s.board.nodes.map((n) => [n.owner, n.domino, n.end, n.depth])).toEqual([
    ["ana", "boost_gale_ember", null, 0], ["ben", "boost_ember_tide", 0, 1], ["cy", "boost_tide_gale", 1, 2], ["dee", "junction_gale", 2, 3],
    ["ben", "boost_tide", 4, 4], ["ana", "boost_ember", 3, 4], ["dee", "junction_tide", 5, 5], ["cy", "junction_ember", 6, 5],
    ["ben", "strike_tide", 9, 6], ["dee", "strike_gale", 7, 6], ["cy", "guard_gale", 10, 6], ["ana", "strike_ember", 8, 6],
  ]);
  expect(getView(s, "ana").openEnds).toEqual([]); // placing the last cap fires nothing
  expect(s.round).toBe(1);
  expect(s.players.map((p) => getPlayerChoices(s, p.id)!.placementsLeft)).toEqual([0, 0, 0, 0]);
  expect(s.players.map((p) => p.hand.length)).toEqual([2, 2, 2, 2]);

  // Everyone presses Ready; the last one fires it.
  s = ready(ready(ready(s, "dee"), "ana"), "cy");
  expect(s.round).toBe(1);
  const last = step(s, { type: "ready", player: "ben", ready: true });
  s = last.state;
  expect(last.events.map((e) => e.type).slice(0, 2)).toEqual(["ready", "setOff"]);
  expect(last.events.filter((e) => e.type === "capFired")).toMatchObject([
    { domino: "strike_tide", value: 35 }, { domino: "strike_gale", value: 35 }, { domino: "guard_gale", effect: "block", value: 25 }, { domino: "strike_ember", value: 40 },
  ]);
  expect(last.events.filter((e) => e.type === "nodeLit").map((e) => (e as { hit: number }).hit)).toEqual([2, 3, 4, 4, 5, 5, 5, 5, 35, 35, 0, 40]); // the Guard hits for 0
  expect(last.events.filter((e) => e.type === "damage" && e.side === "enemy").map((e) => (e as { amount: number }).amount)).toEqual([2, 3, 4, 4, 5, 5, 5, 5, 35, 35, 40]);
  expect(last.events.filter((e) => e.type === "lineReached")).toEqual([{ type: "lineReached", total: 143, line: 120 }]); // the last cap crosses it (103 before)
  const lineAt = last.events.findIndex((e) => e.type === "lineReached");
  expect(last.events[lineAt - 1]).toMatchObject({ type: "damage", side: "enemy", amount: 40 });
  expect(last.events.find((e) => e.type === "enemyAction")).toMatchObject({ staggered: true, fullIntent: { actions: [{ kind: "attack", value: 20 }] }, intent: { actions: [{ kind: "attack", value: 10 }] } });
  expect(last.events.filter((e) => e.type === "damage" && e.side === "party")).toEqual([{ type: "damage", side: "party", amount: 0, blocked: 10 }]);
  expect(s.enemy.health).toBe(340 - 143);
  expect(s.party.health).toBe(90);
  expect(s.party.block).toBe(0);

  // The next round: an empty board, nobody Ready, the board's dominoes in the discards, hands refilled to 5.
  expect(s.round).toBe(2);
  expect(s.enemy.staggered).toBe(false); // the stagger lasted the round
  expect(s.board.nodes).toEqual([]);
  expect(s.players.map((p) => p.ready)).toEqual([false, false, false, false]);
  expect(s.players.map((p) => p.discard)).toEqual([
    ["boost_gale_ember", "boost_ember", "strike_ember"], ["boost_ember_tide", "boost_tide", "strike_tide"],
    ["boost_tide_gale", "junction_ember", "guard_gale"], ["junction_gale", "junction_tide", "strike_gale"],
  ].map((d) => expect.arrayContaining(d)));
  expect(s.players.map((p) => p.hand)).toEqual(hands.map((h, i) => [...h.slice(3), ...nextDraws[i]]));
  expect(s.players.map((p) => getPlayerChoices(s, p.id)!.placementsLeft)).toEqual([3, 3, 3, 3]);
});

test("take-backs refund the placement; refused for a node with a child, a teammate's node and while Ready; placing is refused past the budget", () => {
  // 3 placements for the party: 1 each.
  let s = setup([["boost_ember", "strike_ember"], ["junction_ember", "strike_tide"], ["guard_gale"]], 12, [], { ...content.config, partyPlacements: 3 });
  expect(s.players.map((p) => p.placements)).toEqual([1, 1, 1]);

  s = play(s, "a", "boost_ember"); // the opener
  expect(() => play(s, "a", "strike_ember", 0)).toThrow(/no placements/); // the budget is spent
  // With no placements left, a can still take back while not Ready.
  expect(getPlayerChoices(s, "a")).toMatchObject({ placementsLeft: 0, plays: [], takeBacks: [0], ready: false });

  s = play(s, "b", "junction_ember", 0);
  expect(getPlayerChoices(s, "a")!.takeBacks).toEqual([]); // the opener has a child now
  expect(() => takeBack(s, "a", 0)).toThrow(); // a node with a child
  expect(() => takeBack(s, "c", 1)).toThrow(); // a teammate's node
  expect(() => takeBack(s, "a", 1)).toThrow();
  expect(() => takeBack(s, "a", 9)).toThrow(); // no such node

  s = ready(s, "b");
  expect(() => ready(s, "b")).toThrow(); // Ready when already Ready is an error, not a no-op
  expect(() => takeBack(s, "b", 1)).toThrow(/Ready/);
  expect(() => play(s, "b", "strike_tide", 1)).toThrow(/Ready/);
  expect(getPlayerChoices(s, "b")).toMatchObject({ ready: true, plays: [], takeBacks: [] });
  expect(() => ready(s, "c", false)).toThrow(); // not Ready: nothing to switch off
  s = ready(s, "b", false);

  // b takes back the junction: it returns to b's hand, the placement is refunded, and a's opener is free again.
  const back = step(s, { type: "takeBack", player: "b", node: 1 });
  s = back.state;
  expect(back.events).toEqual([{ type: "takeBack", player: "b", domino: "junction_ember", node: 1 }]);
  expect(s.players[1].hand).toContain("junction_ember");
  expect(getPlayerChoices(s, "b")).toMatchObject({ placementsLeft: 1, takeBacks: [] });
  expect(s.board.ends).toHaveLength(1);
  expect(getPlayerChoices(s, "a")!.takeBacks).toEqual([0]);

  // The opener goes the same way; the board is empty and the next placement is an opener again.
  s = takeBack(s, "a", 0);
  expect(s.board).toMatchObject({ nodes: [], ends: [] });
  expect(getPlayerChoices(s, "a")).toMatchObject({ opener: true, placementsLeft: 1 });
  s = play(s, "b", "junction_ember");
  expect(s.board.nodes).toMatchObject([{ owner: "b", domino: "junction_ember", end: null, depth: 0 }]);
});

test("ids are stable: after a take-back, a choice built on the old view for a gone end or node is refused and changes nothing", () => {
  let s = setup([["junction_ember", "junction_tide", "strike_ember"], ["junction_gale", "strike_ember"], ["junction_gale", "guard_gale"]]);
  s = play(s, "a", "junction_ember"); // node 0: end 0 Tide, end 1 Gale
  s = play(s, "a", "junction_tide", 0); // node 1: end 2 Gale, end 3 Ember
  s = play(s, "b", "junction_gale", 1); // node 2: end 4 Ember, end 5 Tide
  s = play(s, "b", "strike_ember", 3); // node 3
  s = play(s, "c", "junction_gale", 2); // node 4: end 6 Ember, end 7 Tide
  expect(getView(s, "a").openEnds.map((e) => e.end)).toEqual([4, 5, 6, 7]);

  // b takes node 2 back. It had ends 4 and 5; nothing else is renumbered, and the end it hung from (1) is open again.
  s = takeBack(s, "b", 2);
  expect(s.board.nodes.map((n) => n.id)).toEqual([0, 1, 3, 4]);
  expect(getView(s, "a").openEnds.map((e) => [e.end, e.spark])).toEqual([[1, "Gale"], [6, "Ember"], [7, "Tide"]]);

  // a's choice was built before the take-back: strike_ember on end 4, which was legal then. With index ids,
  // end 4 would now be c's Ember end and the play would land there. Now it is refused and nothing changes.
  const before = JSON.stringify(s);
  expect(() => play(s, "a", "strike_ember", 4)).toThrow(/illegal end/);
  // The same goes for b taking node 2 back twice: with index ids that would remove b's other leaf, node 3.
  expect(() => takeBack(s, "b", 2)).toThrow(/can't take that node back/);
  expect(JSON.stringify(s)).toBe(before);

  // The re-opened end keeps its id and takes a new play; the open-end count follows.
  s = play(s, "c", "guard_gale", 1);
  expect(getView(s, "a").openEnds.map((e) => e.end)).toEqual([6, 7]);

  // The counters run on for the whole battle: after the round passes, a stale choice carrying a round-1 end id
  // (end 0 here) can't match the new board's first end, which would have had id 0 if the ids restarted.
  s = fire(s).state;
  expect(s.round).toBe(2);
  s.players[0].hand = ["boost_ember", "strike_ember"];
  s = play(s, "a", "boost_ember");
  expect(s.board.ends.map((e) => e.id)).toEqual([8]);
  expect(() => play(s, "a", "strike_ember", 0)).toThrow(/illegal end/);
});

test("echo and spectrum on a branching tree: echo doubles the caps further along its path, spectrum counts the sparks on its path", () => {
  let s = setup([["boost_ember", "spectrum_gale"], ["junction_ember", "strike_tide"], ["echo_tide", "guard_gale"]], 8);
  s = play(s, "a", "boost_ember"); // charge 2
  s = play(s, "b", "junction_ember", 0); // end 1 Tide, end 2 Gale, both charge 2
  s = play(s, "c", "echo_tide", 1); // charge 2, caps further on go off twice; open end 3 (Tide)
  expect(getView(s, "a").openEnds).toMatchObject([
    { end: 2, spark: "Gale", charge: 2, triggers: 1 },
    { end: 3, spark: "Tide", charge: 2, triggers: 2 },
  ]);
  // Spectrum on the Gale end: the path's sparks are Ember (the junction) and Gale (itself), so 2 + 2.
  expect(previewPlay(s, "a", "spectrum_gale", 2)).toMatchObject({ charge: 4 });
  s = play(s, "a", "spectrum_gale", 2); // open end 4 (Gale) at charge 4
  expect(getView(s, "b").openEnds.map((e) => [e.end, e.charge])).toEqual([[3, 2], [4, 4]]);
  expect(previewPlay(s, "b", "strike_tide", 3)).toMatchObject({ value: 14, triggers: 2, total: 28 });
  s = play(s, "b", "strike_tide", 3); // 7 x 2 = 14, twice
  expect(previewCascade(s)).toEqual({ damage: 38, block: 0, comboTotal: 38, lineReached: false }); // 28 from the strike, 10 from the dominoes before it
  s = play(s, "c", "guard_gale", 4); // 5 x 4 = 20 block
  s = fire(s).state;

  expect(s.enemy.health).toBe(100 - 38);
  expect(s.party.health).toBe(90); // the 20 block absorbed the whole attack of 8
  expect(s.round).toBe(2);
});

test("Ready fires uncapped ends as fizzles, and an empty board can fire: nothing goes off and the enemy still acts", () => {
  let s = setup([["boost_ember"], ["junction_ember"], ["strike_tide"]], 8);
  s = play(s, "a", "boost_ember");
  s = play(s, "b", "junction_ember", 0); // ends 1 (Tide) and 2 (Gale)
  s = play(s, "c", "strike_tide", 1); // the Gale end stays open

  const first = fire(s);
  s = first.state;
  expect(first.events.find((e) => e.type === "setOff")).toMatchObject({ reason: "ready" });
  expect(first.events.filter((e) => e.type === "fizzle")).toEqual([{ type: "fizzle", end: 2, spark: "Gale", charge: 2 }]);
  expect(s.enemy.health).toBe(100 - 18); // 7 x charge 2, and the opener and the junction hit for 2 each; the uncapped end only loses its cap's hit
  expect(s.party.health).toBe(90 - 8);
  expect(s.round).toBe(2);

  const empty = fire(s);
  expect(empty.events.some((e) => e.type === "capFired" || e.type === "nodeLit" || e.type === "fizzle")).toBe(false);
  expect(empty.state.enemy.health).toBe(100 - 18);
  expect(empty.state.party.health).toBe(90 - 16);
  expect(empty.state.round).toBe(3);

  // A board with no cap still hits: the amplifier and the junction land 2 and 2, and both ends fizzle.
  let bare = empty.state;
  bare.players[0].hand = ["boost_ember"];
  bare.players[1].hand = ["junction_ember"];
  bare = play(bare, "a", "boost_ember");
  bare = play(bare, "b", "junction_ember", bare.board.ends[0].id); // ids run on across rounds
  expect(previewSetOff(getView(bare, "a"))).toMatchObject({ canSetOff: true, damage: 4, comboTotal: 4 });
  const capless = fire(bare);
  expect(capless.events.filter((e) => e.type === "fizzle")).toHaveLength(2);
  expect(capless.events.filter((e) => e.type === "damage" && e.side === "enemy").map((e) => (e as { amount: number }).amount)).toEqual([2, 2]);
  expect(capless.state.enemy.health).toBe(100 - 18 - 4);
});

test("the Warden's lock blocks an attachment, and the Auditor fires when a cap repeats the spark before it", () => {
  const passives: Enemy["passives"] = [
    { kind: "warden", sparks: ["Ember"], name: "Warden", short: "x" },
    { kind: "auditor", damage: 7, name: "Auditor", short: "x" },
  ];
  let s = setup([["junction_ember", "guard_gale"], ["junction_tide", "strike_ember"], ["guard_gale"]], 5, passives);
  expect(s.locked).toBe("Ember");
  s = play(s, "a", "junction_ember"); // ends 0 (Tide) and 1 (Gale)
  s = play(s, "b", "junction_tide", 0); // ends 2 (Gale) and 3 (Ember, locked)
  s = play(s, "c", "guard_gale", 1); // caps the first Gale end
  s = play(s, "a", "guard_gale", 2); // caps the second Gale end

  // b has a cap for the Ember end, but the lock makes it the only open end and it is unusable.
  expect(getView(s, "b").locked).toBe("Ember");
  expect(getPlayerChoices(s, "b")).toMatchObject({ opener: false, plays: [] });
  expect(() => play(s, "b", "strike_ember", 3)).toThrow();

  const last = fire(s);
  // Both guards take the Gale spark. The second repeats the first, so the Auditor hits for 7 and the 5 block from the first guard absorbs part of it.
  expect(last.events.filter((e) => e.type === "passive" || e.type === "capFired" || (e.type === "damage" && e.side === "party"))).toMatchObject([
    { type: "capFired", owner: "c" },
    { type: "capFired", owner: "a" },
    { type: "passive", passive: "auditor", amount: 7 },
    { type: "damage", amount: 2, blocked: 5 },
    { type: "damage", amount: 0, blocked: 5 }, // the enemy's attack of 5 meets the second guard's 5 block
    { type: "passive", passive: "warden", spark: "Ember" }, // round 2 starts and the lock is chosen again
  ]);
  expect(last.state.party.health).toBe(90 - 2);
  expect(last.state.locked).toBe("Ember"); // the lock is chosen again for round 2 (the only spark in the list)
});

test("charms: Keystone adds after a Double's own change, Hall of Mirrors opens a third end, Tide Lens adds to a cap", () => {
  const doubleEmber: Domino = { id: "double_ember", name: "Ember Double", kind: "amplifier", intake: ["Ember"], output: ["Ember"], amp: { op: "mul", value: 2 } };
  let s = createBattle({
    config: content.config,
    content: { dominoes: [...dominoes, doubleEmber], enemies: [dummy(12)] },
    players: [
      { id: "a", deck: content.starterDeck, charms: ["keystone", "hall_of_mirrors"] },
      { id: "b", deck: content.starterDeck, charms: ["tide_lens"] },
      { id: "c", deck: content.starterDeck },
    ],
    seatOrder: ["a", "b", "c"],
    enemyId: "dummy",
    seed: 1,
    charms: content.charms,
  });
  [["double_ember", "junction_ember", "guard_gale"], ["strike_tide"], ["guard_tide"]].forEach((hand, i) => (s.players[i].hand = hand));

  s = play(s, "a", "double_ember"); // 1 x 2 = 2, then Keystone +1 = 3
  expect(getView(s, "b").openEnds).toMatchObject([{ end: 0, spark: "Ember", charge: 3 }]);
  const junction = step(s, { type: "play", player: "a", domino: "junction_ember", end: 0 }); // Hall of Mirrors: Tide, Gale and a second Tide
  s = junction.state;
  expect(junction.events.map((e) => e.type)).toEqual(["play", "charm"]);
  expect(getView(s, "b").openEnds).toMatchObject([
    { end: 1, spark: "Tide", charge: 3 },
    { end: 2, spark: "Gale", charge: 3 },
    { end: 3, spark: "Tide", charge: 3 },
  ]);
  expect(previewPlay(s, "b", "strike_tide", 1)).toMatchObject({ value: 23, total: 23 }); // 7 x 3 + 2 from Tide Lens
  s = play(s, "b", "strike_tide", 1);
  s = play(s, "c", "guard_tide", 3);
  s = play(s, "a", "guard_gale", 2);
  const last = fire(s);

  const charms = last.events.filter((e) => e.type === "charm").map((e) => (e as { player: string; charm: string }).player + ":" + (e as { charm: string }).charm);
  expect(charms).toEqual(["a:keystone", "b:tide_lens"]);
  expect(last.state.enemy.health).toBe(100 - 23 - 6); // the Double and the junction each hit for 3
  expect(last.state.party.health).toBe(90); // 30 block absorbed the attack of 12
});

test("hand size is placements + 2, plus Early Riser +1 and Deep Pockets +2 (no charm adds placements)", () => {
  const s = createBattle({
    config: content.config,
    content: { dominoes, enemies: [dummy(12)] },
    players: [
      { id: "a", deck: content.starterDeck, charms: ["early_riser", "deep_pockets"] },
      { id: "b", deck: content.starterDeck, charms: ["early_riser"] },
      { id: "c", deck: content.starterDeck },
    ],
    seatOrder: ["a", "b", "c"],
    enemyId: "dummy",
    seed: 1,
    charms: content.charms,
  });
  expect(s.players.map((p) => [p.placements, p.hand.length])).toEqual([[4, 9], [4, 7], [4, 6]]);
});

test("at party size 2, enemy health and each attack hit use the 2-player table entries, after growth, rounded up", () => {
  // Test-only table values, so this stays valid when the shipped numbers are tuned.
  const config = { ...content.config, enemyHealthPercentByPartySize: [100, 150, 100, 100], enemyAttackPercentByPartySize: [100, 125, 100, 100] };
  const smolder: Enemy = { ...dummy(10, [{ kind: "smolder", growth: 2, name: "Smolder", short: "x" }]), intents: [{ id: "hit", actions: [{ kind: "attack", value: 10, hits: 2 }] }] };
  const s = createBattle({ config, content: { dominoes, enemies: [smolder] }, players: ["a", "b"].map((id) => ({ id, deck: content.starterDeck })), seatOrder: ["a", "b"], enemyId: "dummy", seed: 1 });
  expect(s.enemy.health).toBe(150);
  expect(getView(s, "a").intent.actions).toEqual([{ kind: "attack", value: 13, hits: 2 }]); // ceil(10 x 1.25)
  const last = fire(s); // both Ready on an empty board
  expect(last.events.filter((e) => e.type === "damage" && e.side === "party")).toHaveLength(2); // each hit scaled, not the total
  expect(last.state.party.health).toBe(90 - 26);
  expect(getView(last.state, "a").intent.actions).toEqual([{ kind: "attack", value: 15, hits: 2 }]); // round 2: ceil(12 x 1.25) after growth
});

test("the set-off preview, for a hover or the board as it stands, matches what setting off does: enemy block, a multi-hit intent, Long Night, and a lethal cascade that stops early", () => {
  const brute: Enemy = {
    ...dummy(0, [{ kind: "hoarder", multiplier: 2, name: "Hoarder", short: "x" }, { kind: "longNight", growth: 1, name: "Long Night", short: "x" }]),
    intents: [{ id: "hit", actions: [{ kind: "attack", value: 5, hits: 3 }] }],
  };
  const build = (enemyHealth: number): BattleState => {
    let s = createBattle({
      config: content.config,
      content: { dominoes, enemies: [brute] },
      players: ["a", "b", "c"].map((id) => ({ id, deck: content.starterDeck })),
      seatOrder: ["a", "b", "c"],
      enemyId: "dummy",
      seed: 1,
    });
    [["boost_ember", "guard_gale"], ["junction_ember", "strike4_ember"], ["double_tide"]].forEach((hand, i) => (s.players[i].hand = hand));
    s.enemy.health = enemyHealth;
    s = play(s, "a", "boost_ember");
    s = play(s, "b", "junction_ember", 0);
    s = play(s, "c", "double_tide", 1);
    return play(s, "a", "guard_gale", 2); // b holds the strike
  };

  for (const enemyHealth of [100, 5]) {
    const s = build(enemyHealth);
    const view = getView(s, "b");
    const before = JSON.stringify(s);
    const hover = previewSetOff(view, { player: "b", domino: "strike4_ember", end: 3 });
    const now = previewSetOff(view);
    expect(JSON.stringify(s)).toBe(before); // nothing advanced: board, intent queue and rng are as they were
    expect(now).toMatchObject({ canSetOff: true, damage: 0, partyBlockGain: 10 }); // the strike is not on the board yet
    expect(previewSetOff(view, { player: "b", domino: "strike4_ember", end: 0 })).toBeNull(); // not a legal end

    const { state, events } = fire(play(s, "b", "strike4_ember", 3));
    const dealt = events.filter((e) => e.type === "damage" && e.side === "enemy") as { amount: number; blocked: number }[];
    expect(hover?.damage).toBe(Math.min(dealt.reduce((n, e) => n + e.amount, 0), enemyHealth)); // the last hit can overkill
    expect(hover?.enemyBlockUsed).toBe(dealt.reduce((n, e) => n + e.blocked, 0));
    expect(hover?.partyHealth).toBe(state.party.health);
    expect(hover?.lethal).toBe(state.result === "won");
    if (enemyHealth === 100) {
      // Hoarder: 5 dominoes x 2 = 10 block, used up first by the hits 2, 2 and 4, then 2 of the strike's 16 (14 gets through). Long Night: 2 caps, so 3 hits of 7 against 10 block.
      expect(hover).toMatchObject({ comboTotal: 24, lineReached: false, damage: 14, enemyBlockUsed: 10, enemyBlock: 0, enemyHealth: 86, lethal: false, partyBlockGain: 10, partyDamage: 11, partyHealth: 79 });
    } else {
      expect(hover).toMatchObject({ lethal: true, enemyHealth: 0, partyDamage: 0, partyHealth: 90 });
      expect(events.some((e) => e.type === "enemyAction")).toBe(false);
    }
  }
});

test("stagger: enemy block absorbs the first small hits, and the staggered multi-hit attack is halved per hit", () => {
  const ogre: Enemy = { ...dummy(0, [], 100, 15), intents: [{ id: "hit", actions: [{ kind: "attack", value: 5, hits: 3 }] }] };
  let s = createBattle({
    config: content.config,
    content: { dominoes, enemies: [ogre] },
    players: ["a", "b"].map((id) => ({ id, deck: content.starterDeck })),
    seatOrder: ["a", "b"],
    enemyId: "dummy",
    seed: 1,
  });
  s.players[0].hand = ["boost_ember", "strike_ember"];
  s.enemy.block = 6;
  s = play(play(s, "a", "boost_ember"), "a", "strike_ember", 0); // hits 2, then 8 x 2 = 16
  expect(previewSetOff(getView(s, "a"))).toMatchObject({ comboTotal: 18, lineReached: true, damage: 12, partyDamage: 6 }); // 3 hits of 2, not 3 of 5
  const { state, events } = fire(s);
  expect(events.filter((e) => e.type === "damage" && e.side === "enemy")).toEqual([
    { type: "damage", side: "enemy", amount: 0, blocked: 2 }, // block 6 takes the small hit whole
    { type: "damage", side: "enemy", amount: 12, blocked: 4 }, // and the rest of itself off the strike
  ]);
  expect(events.filter((e) => e.type === "lineReached")).toEqual([{ type: "lineReached", total: 18, line: 15 }]);
  expect(events.find((e) => e.type === "enemyAction")).toMatchObject({ staggered: true, fullIntent: { actions: [{ value: 5, hits: 3 }] }, intent: { actions: [{ value: 2, hits: 3 }] } });
  expect(events.filter((e) => e.type === "damage" && e.side === "party").map((e) => (e as { amount: number }).amount)).toEqual([2, 2, 2]);
  expect(state.enemy.health).toBe(88);
  expect(state.party.health).toBe(84);
  expect(getView(state, "a").intent.actions).toEqual([{ kind: "attack", value: 5, hits: 3 }]); // next round, not staggered
});
