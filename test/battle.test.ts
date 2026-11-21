import { expect, test } from "vitest";
import { applyChoice, createBattle, getPendingChoice, previewCascade, previewPlay, previewSetOff, step } from "../src/engine/battle";
import type { BattleState, Choice } from "../src/engine/battle";
import { getView } from "../src/engine/view";
import type { Domino, Enemy } from "../src/engine/types";
import { loadContent } from "../src/engine/content";

const content = loadContent();

// Test-only dominoes, so the worked example from docs/design-branching-cascade.md can be built exactly.
const doubleTide: Domino = { id: "double_tide", name: "Tide Double", kind: "amplifier", intake: ["Tide"], output: ["Ember"], amp: { op: "mul", value: 2 } };
const strike4: Domino = { id: "strike4_ember", name: "Ember Strike 4", kind: "cap", intake: ["Ember"], output: [], effect: { kind: "damage", base: 4 } };
const echoTide: Domino = { id: "echo_tide", name: "Tide Echo", kind: "amplifier", intake: ["Tide"], output: ["Tide"], amp: { op: "echo", value: 1 } };
const spectrumGale: Domino = { id: "spectrum_gale", name: "Gale Spectrum", kind: "amplifier", intake: ["Gale"], output: ["Gale"], amp: { op: "spectrum", value: 1 } };
const dominoes = [...content.dominoes, doubleTide, strike4, echoTide, spectrumGale];

// A test enemy with 100 health that makes one attack of `attack` every round.
function dummy(attack: number, passives: Enemy["passives"] = []): Enemy {
  return {
    id: "dummy",
    name: "Dummy",
    tier: "basic",
    maxHealth: 100,
    intents: [{ id: "hit", actions: [{ kind: "attack", value: attack }] }],
    pattern: { type: "cycle", order: ["hit"] },
    passives,
  };
}

// Three players against the dummy, which attacks for 12 every round. Hands are set to known dominoes.
function setup(hands: string[][], attack = 12, passives: Enemy["passives"] = []): BattleState {
  const state = createBattle({
    config: content.config,
    content: { dominoes, enemies: [dummy(attack, passives)] },
    players: ["a", "b", "c"].map((id) => ({ id, deck: content.starterDeck })),
    seatOrder: ["a", "b", "c"],
    enemyId: "dummy",
    seed: 1,
  });
  hands.forEach((hand, i) => (state.players[i].hand = hand));
  return state;
}

function play(s: BattleState, domino: string, end?: number): BattleState {
  return applyChoice(s, { type: "play", domino, end });
}

test("worked example: boost, junction, double, guard and strike set off by themselves for 6 block and 16 damage, then the enemy attacks", () => {
  let s = setup([["boost_ember", "guard_gale"], ["junction_ember", "strike4_ember"], ["double_tide"]]);
  expect(s.intent).toEqual({ id: "hit", actions: [{ kind: "attack", value: 12 }] });

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
  expect(previewCascade(s)).toEqual({ damage: 0, block: 6 }); // the strike is not on the board yet

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
  expect(events.find((e) => e.type === "enemyAction")).toMatchObject({ intent: { actions: [{ kind: "attack", value: 12 }] } });
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
  expect(previewPlay(s, "b", "strike_tide", 3)).toMatchObject({ value: 14, triggers: 2, total: 28 });
  s = play(s, "strike_tide", 3); // b: 7 x 2 = 14, twice
  expect(previewCascade(s)).toEqual({ damage: 28, block: 0 });
  s = play(s, "guard_gale", 4); // c: 3 x 4 = 12 block; every end is capped

  expect(s.enemy.health).toBe(100 - 28);
  expect(s.party.health).toBe(90); // the 12 block absorbed the whole attack of 8
  expect(s.round).toBe(2);
});

test("a full round of passes sets the chain off: uncapped ends fizzle, and with no cap nothing fires", () => {
  let s = setup([["boost_ember"], ["junction_ember"], ["strike_tide"]], 8);
  s = play(s, "boost_ember");
  s = play(s, "junction_ember", 0); // ends 1 (Tide) and 2 (Gale)
  s = play(s, "strike_tide", 1); // the Gale end stays open
  expect(getPendingChoice(s)).toMatchObject({ player: "a" });

  const pass: Choice = { type: "pass" };
  s = applyChoice(s, pass);
  s = applyChoice(s, pass);
  const last = step(s, pass);
  s = last.state;
  expect(last.events.find((e) => e.type === "setOff")).toMatchObject({ reason: "passes" });
  expect(last.events.filter((e) => e.type === "fizzle")).toEqual([{ type: "fizzle", end: 2, spark: "Gale", charge: 2 }]);
  expect(s.enemy.health).toBe(100 - 14); // 7 x charge 2
  expect(s.party.health).toBe(90 - 8);
  expect(s.round).toBe(2);

  // Round 2: everyone passes with an empty board. Nothing fires, and the enemy still acts.
  s = applyChoice(s, pass);
  s = applyChoice(s, pass);
  const empty = step(s, pass);
  expect(empty.events.some((e) => e.type === "capFired" || e.type === "nodeLit" || e.type === "fizzle")).toBe(false);
  expect(empty.state.enemy.health).toBe(100 - 14);
  expect(empty.state.party.health).toBe(90 - 16);
  expect(empty.state.round).toBe(3);
});

test("three players: two passes do not fire the cascade and the third does (passFires says so); a setOff choice is rejected", () => {
  let s = setup([["boost_ember"], ["strike_tide"], ["guard_gale"]]);
  s = play(s, "boost_ember"); // a: open end 0 (Ember)
  expect(() => step(s, { type: "setOff" } as unknown as Choice)).toThrow(); // there is no manual set off
  expect(getView(s, "b").passFires).toBe(false);

  s = applyChoice(s, { type: "pass" }); // b
  expect(getView(s, "c").passFires).toBe(false);
  s = applyChoice(s, { type: "pass" }); // c
  expect(s.round).toBe(1);
  expect(getView(s, "a").passFires).toBe(true); // a's pass would be the third in a row

  const last = step(s, { type: "pass" });
  expect(last.events.find((e) => e.type === "setOff")).toEqual({ type: "setOff", reason: "passes" });
  expect(last.state.round).toBe(2);
  expect(getView(last.state, "a").passFires).toBe(false);
});

test("the Warden's lock blocks an attachment, and the Auditor fires when a cap repeats the spark before it", () => {
  const passives: Enemy["passives"] = [
    { kind: "warden", sparks: ["Ember"], name: "Warden", short: "x" },
    { kind: "auditor", damage: 7, name: "Auditor", short: "x" },
  ];
  let s = setup([["junction_ember", "guard_gale"], ["junction_tide", "strike_ember"], ["guard_gale"]], 5, passives);
  expect(s.locked).toBe("Ember");
  s = play(s, "junction_ember"); // a: ends 0 (Tide) and 1 (Gale)
  s = play(s, "junction_tide", 0); // b: ends 2 (Gale) and 3 (Ember, locked)
  s = play(s, "guard_gale", 1); // c: caps the first Gale end
  s = play(s, "guard_gale", 2); // a: caps the second Gale end

  // b has a cap for the Ember end, but the lock makes it the only open end and it is unusable. b can only pass.
  expect(getView(s, "b").locked).toBe("Ember");
  expect(getPendingChoice(s)).toEqual({ player: "b", opener: false, plays: [] });
  expect(() => play(s, "strike_ember", 3)).toThrow();

  s = applyChoice(s, { type: "pass" }); // b
  s = applyChoice(s, { type: "pass" }); // c
  const last = step(s, { type: "pass" }); // a: the round of passes sets the chain off
  // Both guards take the Gale spark. The second repeats the first, so the Auditor hits for 7 and the 3 block from the first guard absorbs part of it.
  expect(last.events.filter((e) => e.type === "passive" || e.type === "capFired" || (e.type === "damage" && e.side === "party"))).toMatchObject([
    { type: "capFired", owner: "c" },
    { type: "capFired", owner: "a" },
    { type: "passive", passive: "auditor", amount: 7 },
    { type: "damage", amount: 4, blocked: 3 },
    { type: "damage", amount: 2, blocked: 3 }, // the enemy's attack of 5 meets the second guard's 3 block
    { type: "passive", passive: "warden", spark: "Ember" }, // round 2 starts and the lock is chosen again
  ]);
  expect(last.state.party.health).toBe(90 - 4 - 2);
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
  expect(previewPlay(s, "b", "strike_tide", 1)).toMatchObject({ value: 23, total: 23 }); // 7 x 3 + 2 from Tide Lens
  s = play(s, "strike_tide", 1);
  s = play(s, "guard_tide", 3);
  const last = step(s, { type: "play", domino: "guard_gale", end: 2 });

  const charms = last.events.filter((e) => e.type === "charm").map((e) => (e as { player: string; charm: string }).player + ":" + (e as { charm: string }).charm);
  expect(charms).toEqual(["a:keystone", "b:tide_lens"]);
  expect(last.state.enemy.health).toBe(100 - 23);
  expect(last.state.party.health).toBe(90); // 27 block absorbed the attack of 12
});

test("at party size 2, enemy health and each attack hit use the 2-player table entries, after growth, rounded up", () => {
  // Test-only table values, so this stays valid when the shipped numbers are tuned.
  const config = { ...content.config, enemyHealthPercentByPartySize: [100, 150, 100, 100], enemyAttackPercentByPartySize: [100, 125, 100, 100] };
  const smolder: Enemy = { ...dummy(10, [{ kind: "smolder", growth: 2, name: "Smolder", short: "x" }]), intents: [{ id: "hit", actions: [{ kind: "attack", value: 10, hits: 2 }] }] };
  const s = createBattle({ config, content: { dominoes, enemies: [smolder] }, players: ["a", "b"].map((id) => ({ id, deck: content.starterDeck })), seatOrder: ["a", "b"], enemyId: "dummy", seed: 1 });
  expect(s.enemy.health).toBe(150);
  expect(getView(s, "a").intent.actions).toEqual([{ kind: "attack", value: 13, hits: 2 }]); // ceil(10 x 1.25)
  const last = step(applyChoice(s, { type: "pass" }), { type: "pass" }); // two passes in a row set off a 2-player board
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
    s = play(s, "boost_ember");
    s = play(s, "junction_ember", 0);
    s = play(s, "double_tide", 1);
    return play(s, "guard_gale", 2); // b is next, holding the strike
  };

  for (const enemyHealth of [100, 5]) {
    const s = build(enemyHealth);
    const view = getView(s, "b");
    const before = JSON.stringify(s);
    const hover = previewSetOff(view, { player: "b", domino: "strike4_ember", end: 3 });
    const now = previewSetOff(view);
    expect(JSON.stringify(s)).toBe(before); // nothing advanced: board, intent queue and rng are as they were
    expect(now).toMatchObject({ canSetOff: true, damage: 0, partyBlockGain: 6 }); // the strike is not on the board yet
    expect(previewSetOff(view, { player: "b", domino: "strike4_ember", end: 0 })).toBeNull(); // not a legal end

    const { state, events } = step(s, { type: "play", domino: "strike4_ember", end: 3 });
    const dealt = events.filter((e) => e.type === "damage" && e.side === "enemy") as { amount: number; blocked: number }[];
    expect(hover?.damage).toBe(Math.min(dealt.reduce((n, e) => n + e.amount, 0), enemyHealth)); // the last hit can overkill
    expect(hover?.enemyBlockUsed).toBe(dealt.reduce((n, e) => n + e.blocked, 0));
    expect(hover?.partyHealth).toBe(state.party.health);
    expect(hover?.lethal).toBe(state.result === "won");
    if (enemyHealth === 100) {
      // Hoarder: 5 dominoes x 2 = 10 block, used up first (16 - 10 = 6 gets through). Long Night: 2 caps, so 3 hits of 7 against 6 block.
      expect(hover).toMatchObject({ damage: 6, enemyBlockUsed: 10, enemyBlock: 0, enemyHealth: 94, lethal: false, partyBlockGain: 6, partyDamage: 15, partyHealth: 75 });
    } else {
      expect(hover).toMatchObject({ lethal: true, enemyHealth: 0, partyDamage: 0, partyHealth: 90 });
      expect(events.some((e) => e.type === "enemyAction")).toBe(false);
    }
  }
});
