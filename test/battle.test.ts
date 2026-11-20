import { expect, test } from "vitest";
import { applyChoice, createBattle, getPendingChoice, previewCascade, previewPlay, step } from "../src/engine/battle";
import type { BattleState, Choice } from "../src/engine/battle";
import { getView } from "../src/engine/view";
import type { Domino } from "../src/engine/types";
import { loadContent } from "../src/engine/content";

const content = loadContent();

// Test-only dominoes, so the worked example from docs/design-branching-cascade.md can be built exactly.
const doubleTide: Domino = { id: "double_tide", name: "Tide Double", kind: "amplifier", intake: ["Tide"], output: ["Ember"], amp: { op: "mul", value: 2 } };
const strike4: Domino = { id: "strike4_ember", name: "Ember Strike 4", kind: "cap", intake: ["Ember"], output: [], effect: { kind: "damage", base: 4 } };
const echoTide: Domino = { id: "echo_tide", name: "Tide Echo", kind: "amplifier", intake: ["Tide"], output: ["Tide"], amp: { op: "echo", value: 1 } };
const spectrumGale: Domino = { id: "spectrum_gale", name: "Gale Spectrum", kind: "amplifier", intake: ["Gale"], output: ["Gale"], amp: { op: "spectrum", value: 1 } };
const dominoes = [...content.dominoes, doubleTide, strike4, echoTide, spectrumGale];

// Three players, Ogre (100 health), the enemy attacks for 12 every round. Hands are set to known dominoes.
function setup(hands: string[][], attack = 12): BattleState {
  const state = createBattle({
    config: content.config,
    content: { dominoes, enemies: content.enemies },
    players: ["a", "b", "c"].map((id) => ({ id, deck: content.starterDeck })),
    seatOrder: ["a", "b", "c"],
    enemyId: "ogre",
    seed: 1,
    intents: [{ attack: [attack], block: 0 }],
  });
  hands.forEach((hand, i) => (state.players[i].hand = hand));
  return state;
}

function play(s: BattleState, domino: string, end?: number): BattleState {
  return applyChoice(s, { type: "play", domino, end });
}

test("worked example: boost, junction, double, guard and strike set off by themselves for 6 block and 16 damage, then the enemy attacks", () => {
  let s = setup([["boost_ember", "guard_gale"], ["junction_ember", "strike4_ember"], ["double_tide"]]);
  expect(s.intent).toEqual({ attack: [12], block: 0 });

  s = play(s, "boost_ember"); // a: charge 1 + 1 = 2, open end 0 (Ember)
  s = play(s, "junction_ember", 0); // b: ends 1 (Tide) and 2 (Gale), both at charge 2
  expect(getView(s, "a").openEnds).toMatchObject([
    { end: 1, spark: "Tide", charge: 2 },
    { end: 2, spark: "Gale", charge: 2 },
  ]);
  expect(previewPlay(s, "c", "double_tide", 1)).toMatchObject({ charge: 4 });
  s = play(s, "double_tide", 1); // c: Tide branch now at 4, open end 3 (Ember)
  expect(previewPlay(s, "a", "guard_gale", 2)).toMatchObject({ value: 6, triggers: 1 });
  s = play(s, "guard_gale", 2); // a caps the Gale branch
  expect(previewPlay(s, "b", "strike4_ember", 3)).toMatchObject({ value: 16, total: 16 });
  expect(previewCascade(s)).toEqual({ damage: 0, block: 6, coins: {} }); // the strike is not on the board yet

  const last = step(s, { type: "play", domino: "strike4_ember", end: 3 }); // b: every end is capped
  s = last.state;
  const events = last.events;

  expect(events.map((e) => e.type).slice(0, 2)).toEqual(["play", "setOff"]);
  expect(events[1]).toMatchObject({ type: "setOff", reason: "capped" });
  // Steps by depth: boost (0), junction (1), double and guard (2, in creation order), strike (3).
  expect(events.filter((e) => e.type === "cascadeStep" || e.type === "nodeLit").map((e) => (e.type === "cascadeStep" ? "step" + e.depth : (e as { domino: string }).domino))).toEqual([
    "step0", "boost_ember", "step1", "junction_ember", "step2", "double_tide", "guard_gale", "step3", "strike4_ember",
  ]);
  expect(events.filter((e) => e.type === "capFired")).toMatchObject([
    { domino: "guard_gale", effect: "block", value: 6, triggers: 1 },
    { domino: "strike4_ember", effect: "damage", value: 16, triggers: 1 },
  ]);
  expect(events.find((e) => e.type === "enemyAction")).toMatchObject({ intent: { attack: [12] } });
  expect(events.filter((e) => e.type === "damage" && e.side === "party")).toEqual([{ type: "damage", side: "party", amount: 6, blocked: 6 }]);

  expect(s.enemy.health).toBe(100 - 16);
  expect(s.party.health).toBe(90 - 6);
  expect(s.party.block).toBe(0);
  expect(s.round).toBe(2);
  expect(s.lead).toBe("b"); // the lead moved on one seat
  expect(s.board.nodes).toEqual([]);
  expect(s.players[0].discard).toEqual(expect.arrayContaining(["boost_ember", "guard_gale"])); // the board went to the owners' discards
});

test("echo and spectrum on a branching tree: echo doubles the caps further along its path, spectrum counts the sparks on its path", () => {
  let s = setup([["boost_ember", "spectrum_gale"], ["junction_ember", "strike_tide"], ["echo_tide", "guard_gale"]], 8);
  s = play(s, "boost_ember"); // a: charge 2
  s = play(s, "junction_ember", 0); // b: end 1 Tide, end 2 Gale, both charge 2
  s = play(s, "echo_tide", 1); // c: charge 2, caps further on go off twice; open end 3 (Tide)
  expect(getView(s, "a").openEnds).toMatchObject([
    { end: 2, spark: "Gale", charge: 2, triggers: 1 },
    { end: 3, spark: "Tide", charge: 2, triggers: 2 },
  ]);
  // Spectrum on the Gale end: the path's sparks are Ember (the junction) and Gale (itself), so 2 + 2.
  expect(previewPlay(s, "a", "spectrum_gale", 2)).toMatchObject({ charge: 4 });
  s = play(s, "spectrum_gale", 2); // a: open end 4 (Gale) at charge 4
  expect(getView(s, "b").openEnds.map((e) => [e.end, e.charge])).toEqual([[3, 2], [4, 4]]);
  expect(previewPlay(s, "b", "strike_tide", 3)).toMatchObject({ value: 6, triggers: 2, total: 12 });
  s = play(s, "strike_tide", 3); // b: 3 x 2 = 6, twice
  expect(previewCascade(s)).toEqual({ damage: 12, block: 0, coins: {} });
  s = play(s, "guard_gale", 4); // c: 3 x 4 = 12 block; every end is capped

  expect(s.enemy.health).toBe(100 - 12);
  expect(s.party.health).toBe(90); // the 12 block absorbed the whole attack of 8
  expect(s.round).toBe(2);
});

test("a full round of passes sets the chain off: uncapped ends fizzle, and with no cap nothing fires", () => {
  let s = setup([["boost_ember"], ["junction_ember"], ["strike_tide"]], 8);
  expect(() => step(s, { type: "setOff" })).toThrow(); // no cap on the board yet
  s = play(s, "boost_ember");
  s = play(s, "junction_ember", 0); // ends 1 (Tide) and 2 (Gale)
  s = play(s, "strike_tide", 1); // the Gale end stays open
  expect(getPendingChoice(s)).toMatchObject({ player: "a", canSetOff: true });

  const pass: Choice = { type: "pass" };
  s = applyChoice(s, pass);
  s = applyChoice(s, pass);
  const last = step(s, pass);
  s = last.state;
  expect(last.events.find((e) => e.type === "setOff")).toMatchObject({ reason: "passes" });
  expect(last.events.filter((e) => e.type === "fizzle")).toEqual([{ type: "fizzle", end: 2, spark: "Gale", charge: 2 }]);
  expect(s.enemy.health).toBe(100 - 6); // 3 x charge 2
  expect(s.party.health).toBe(90 - 8);
  expect(s.round).toBe(2);

  // Round 2: everyone passes with an empty board. Nothing fires, and the enemy still acts.
  s = applyChoice(s, pass);
  s = applyChoice(s, pass);
  const empty = step(s, pass);
  expect(empty.events.some((e) => e.type === "capFired" || e.type === "nodeLit" || e.type === "fizzle")).toBe(false);
  expect(empty.state.enemy.health).toBe(100 - 6);
  expect(empty.state.party.health).toBe(90 - 16);
  expect(empty.state.round).toBe(3);
});

test("charms: Keystone adds after a Double's own change, Hall of Mirrors opens a third end, Tide Lens adds to a cap", () => {
  const doubleEmber: Domino = { id: "double_ember", name: "Ember Double", kind: "amplifier", intake: ["Ember"], output: ["Ember"], amp: { op: "mul", value: 2 } };
  let s = createBattle({
    config: content.config,
    content: { dominoes: [...dominoes, doubleEmber], enemies: content.enemies },
    players: [
      { id: "a", deck: content.starterDeck, charms: ["keystone", "hall_of_mirrors"] },
      { id: "b", deck: content.starterDeck, charms: ["tide_lens"] },
      { id: "c", deck: content.starterDeck },
    ],
    seatOrder: ["a", "b", "c"],
    enemyId: "ogre",
    seed: 1,
    charms: content.charms,
    intents: [{ attack: [12], block: 0 }],
  });
  [["double_ember", "junction_ember", "guard_gale"], ["strike_tide"], ["guard_tide"]].forEach((hand, i) => (s.players[i].hand = hand));

  s = play(s, "double_ember"); // 1 x 2 = 2, then Keystone +1 = 3
  expect(getView(s, "b").openEnds).toMatchObject([{ end: 0, spark: "Ember", charge: 3 }]);
  s = applyChoice(applyChoice(s, { type: "pass" }), { type: "pass" });
  const junction = step(s, { type: "play", domino: "junction_ember", end: 0 }); // Hall of Mirrors: Tide, Gale and a second Tide
  s = junction.state;
  expect(junction.events.map((e) => e.type)).toEqual(["play", "charm"]);
  expect(getView(s, "b").openEnds).toMatchObject([
    { end: 1, spark: "Tide", charge: 3 },
    { end: 2, spark: "Gale", charge: 3 },
    { end: 3, spark: "Tide", charge: 3 },
  ]);
  expect(previewPlay(s, "b", "strike_tide", 1)).toMatchObject({ value: 11, total: 11 }); // 3 x 3 + 2 from Tide Lens
  s = play(s, "strike_tide", 1);
  s = play(s, "guard_tide", 3);
  const last = step(s, { type: "play", domino: "guard_gale", end: 2 });

  const charms = last.events.filter((e) => e.type === "charm").map((e) => (e as { player: string; charm: string }).player + ":" + (e as { charm: string }).charm);
  expect(charms).toEqual(["a:keystone", "b:tide_lens"]);
  expect(last.state.enemy.health).toBe(100 - 11);
  expect(last.state.party.health).toBe(90); // 27 block absorbed the attack of 12
});
