import { expect, test } from "vitest";
import { applyChoice, createBattle, getPendingChoice, previewPlay, step } from "../src/engine/battle";
import type { BattleState } from "../src/engine/battle";
import { getView } from "../src/engine/view";
import type { Domino } from "../src/engine/types";
import { loadContent } from "../src/engine/content";

const content = loadContent();
const config = content.config;
// Plus one test-only domino so two Echoes can follow each other (Echo Stone takes Gale).
const echoTide: Domino = { id: "echo_tide", name: "Echo Tide", intake: ["Tide"], output: ["Gale"], effect: { kind: "echo" } };
const spectrumJab: Domino = { id: "spectrum_jab", name: "Spectrum Jab", intake: ["Tide"], output: ["Storm"], effect: { kind: "damage", base: 3, spectrum: true } };
// Test-only: answers Ember with Ember, so a player can repeat a spark.
const holdEmber: Domino = { id: "hold_ember", name: "Hold Ember", intake: ["Ember"], output: ["Ember"], effect: { kind: "damage", base: 1 } };
const dominoes = [...content.dominoes, echoTide, spectrumJab, holdEmber];
const enemies = content.enemies;
const starterDeck = content.starterDeck;

// A fresh battle (seats p1, p2, enemy) with hands set to known dominoes.
function setup(p1: string[], p2: string[], enemyHand: string[] = [], extraDominoes: Domino[] = []): BattleState {
  const state = createBattle({
    config,
    content: { dominoes, enemies },
    players: [
      { id: "p1", deck: starterDeck },
      { id: "p2", deck: starterDeck },
    ],
    seatOrder: ["p1", "p2", "enemy"],
    enemyId: "ogre",
    seed: 1,
    extraDominoes,
  });
  state.players[0].hand = p1;
  state.players[1].hand = p2;
  state.enemy.hand = enemyHand;
  state.enemy.revealed = enemyHand.map(() => false);
  return state;
}

function opener(s: BattleState, domino: string): BattleState {
  return applyChoice(s, { type: "opener", domino });
}
function answer(s: BattleState, domino: string): BattleState {
  return applyChoice(s, { type: "answer", domino });
}

test("scripted round: strength rises per answer, lap per return to the lead", () => {
  const s0 = setup(["kindle", "splash", "parry"], ["jab", "kindle"]);
  const before = JSON.stringify(s0);

  const s1 = opener(s0, "kindle"); // Ember, strength 0
  expect(JSON.stringify(s0)).toBe(before); // input untouched
  expect(s1.chain).toMatchObject({ strength: 0, lap: 1 });

  const s2 = answer(s1, "jab"); // p2: 3 x 1 x 1
  expect(s2.chain).toMatchObject({ strength: 1, lap: 2, history: ["Ember"] });
  expect(s2.enemy.health).toBe(100 - 3);

  const s3 = answer(s2, "splash"); // p1: 2 x 2 x 2
  expect(s3.chain).toMatchObject({ strength: 2, lap: 2 });
  expect(s3.enemy.health).toBe(97 - 8);

  const s4 = answer(s3, "kindle"); // p2: 2 x 3 x 2, then p1 holds no Ember domino
  expect(s4.enemy.health).toBe(89 - 12);
  expect(s4.round).toBe(2);
});

test("the chain ends when a player can't answer; unplayed dominoes stay in hand", () => {
  const s = opener(setup(["kindle"], ["parry"]), "kindle"); // p2 can't answer Ember
  expect(s.round).toBe(2);
  expect(s.players[1].hand).toContain("parry");
  expect(s.players[1].hand).toHaveLength(1 + config.playerDrawPerRound);
  expect(getPendingChoice(s)).toMatchObject({ type: "opener", player: "p2" });
});

test("block absorbs damage before health, and resets at round end", () => {
  let s = setup(["kindle", "brace"], ["brace", "shelter"], ["ogre_stomp_a"]);
  s = opener(s, "kindle");
  s = answer(s, "brace"); // p2 block 4; enemy Stomp at strength 2 hits for 6
  expect(s.party).toMatchObject({ health: 58, block: 0 });
  s = answer(s, "brace"); // p1 lap 2, strength 3: 4 x 3 x 2
  expect(s.party.block).toBe(24);
  s = answer(s, "shelter"); // p2: 4 x 4 x 2, then p1 can't answer Tide
  expect(s.round).toBe(2);
  expect(s.party).toMatchObject({ health: 58, block: 0 });
});

test("battle ends immediately when enemy health reaches 0 mid-chain", () => {
  const s0 = setup(["kindle", "jab"], ["jab"]);
  s0.enemy.health = 3;
  const s = answer(opener(s0, "kindle"), "jab");
  expect(s.result).toBe("won");
  expect(s.nextLead).toBe("p2");
  expect(getPendingChoice(s)).toBeNull();
  expect(s.players[0].hand).toEqual(["jab"]); // p1 never got another turn
});

test("enemy at its hand limit discards the oldest domino to make room, and keeps drawing", () => {
  const s0 = setup(["kindle"], ["parry"]);
  s0.enemy.hand = ["ogre_gulp_a", "ogre_gulp_b", "ogre_gulp_a", "ogre_gulp_b", "ogre_gulp_a"];
  s0.enemy.revealed = [false, false, false, false, true];
  s0.enemy.deck = ["ogre_bellow_a", "ogre_bellow_b", "ogre_stomp_a"];
  const s = opener(s0, "kindle"); // p2 can't answer, round 2 starts with the draw
  expect(s.enemy.hand).toEqual(["ogre_gulp_b", "ogre_gulp_a", "ogre_bellow_a", "ogre_bellow_b", "ogre_stomp_a"]);
  expect(s.enemy.discard).toEqual(["ogre_gulp_a", "ogre_gulp_b", "ogre_gulp_a"]);
  // Leftovers going off reveals them (decisions.md); the flag moved with its domino.
  expect(s.enemy.revealed).toEqual([true, true, false, false, false]);
});

test("the enemy plays the leftmost matching domino", () => {
  const s0 = setup(["kindle", "brace"], ["brace"], ["ogre_gulp_a", "ogre_stomp_a", "ogre_stomp_b"]);
  const s = answer(opener(s0, "kindle"), "brace"); // Gale: both Stomps match
  expect(s.enemy.hand).toEqual(["ogre_gulp_a", "ogre_stomp_b"]);
  expect(s.enemy.discard).toEqual(["ogre_stomp_a"]);
  expect(s.enemy.faceUp).toEqual(["ogre_stomp_a"]);
  expect(s.chain.strength).toBe(2);
});

test("leftover enemy dominoes go off at strength 1, in order, and stay in hand", () => {
  const s0 = setup(["kindle"], ["parry"], ["ogre_bellow_a", "ogre_stomp_a", "ogre_gulp_a"]);
  s0.enemy.drawPerRound = 0;
  s0.enemy.health = 90;
  s0.party.block = 4;
  const s = opener(s0, "kindle"); // chain ends at once
  expect(s.party).toMatchObject({ health: 58, block: 0 }); // 3 + 3, block soaked 4
  expect(s.enemy.health).toBe(93);
  expect(s.enemy.hand).toHaveLength(3);
});

test("Amplify adds its bonus on top of the normal +1", () => {
  let s = setup(["kindle", "splash", "bellows"], ["jab", "kindle", "shelter"]);
  s = opener(s, "kindle");
  for (const d of ["jab", "splash", "kindle"]) s = answer(s, d); // strength 3
  s = answer(s, "bellows"); // 3 + 1 + 2
  expect(s.chain.strength).toBe(6);
});

test("Echo, Echo, then a damage domino triggers 3 times at the same strength", () => {
  let s = setup(["brace", "echo_tide", "brace"], ["echo_stone", "kindle"]);
  s = opener(s, "brace");
  for (const d of ["echo_stone", "echo_tide", "kindle"]) s = answer(s, d);
  expect(s.enemy.health).toBe(100 - 3 * (2 * 3 * 2)); // base 2, strength 3, lap 2
  expect(s.chain.strength).toBe(3);
});

test("an upgraded Echo (a run instance) makes the next domino trigger 3 times", () => {
  const upgraded: Domino = { id: "echo_stone#1+R", name: "Echo Stone", intake: ["Gale"], output: ["Gale"], effect: { kind: "echo", extraTriggers: 1 } };
  let s = setup(["brace", "kindle"], ["echo_stone#1+R"], [], [upgraded]);
  s = opener(s, "brace");
  for (const d of ["echo_stone#1+R", "kindle"]) s = answer(s, d);
  expect(s.enemy.health).toBe(100 - 3 * (2 * 2 * 2)); // base 2, strength 2, lap 2, three triggers
});

test("Mimic after an enemy damage domino damages the enemy", () => {
  let s = setup(["kindle", "mimic"], ["brace"], ["ogre_stomp_a"]);
  s = opener(s, "kindle");
  s = answer(s, "brace"); // block 4; Stomp: 3 x 2 hits the party
  expect(s.party.health).toBe(58);
  s = answer(s, "mimic"); // copies the Stomp toward the enemy: 3 x 3 x lap 2
  expect(s.enemy.health).toBe(100 - 18);
  expect(s.party.health).toBe(58);
});

test("Spectrum adds the number of different sparks in the history to its strength", () => {
  let s = opener(setup(["kindle"], ["spectrum_jab", "jab"]), "kindle");
  s.players[0].hand = ["wildcard"];
  s.chain.sparks = ["Tide"];
  s.chain.strength = 4;
  s.chain.history = ["Ember", "Tide", "Gale", "Ember"];
  s = answer(s, "spectrum_jab"); // 3 different sparks: 3 x (5 + 3) x lap 1
  expect(s.enemy.health).toBe(100 - 24);
  expect(s.chain.strength).toBe(5); // the next domino plays at 6
});

test("Lookout at strength 3 reveals the two leftmost hidden enemy dominoes", () => {
  const hand = ["ogre_stomp_a", "ogre_stomp_b", "ogre_stomp_a", "ogre_bellow_a"];
  let s = setup(["kindle", "parry"], ["jab", "lookout"], hand);
  s.enemy.drawPerRound = 0;
  s.enemy.revealed = [true, false, false, false]; // the first is already revealed
  s = opener(s, "kindle");
  s = answer(s, "jab"); // p2, strength 1
  s = answer(s, "parry"); // p1, strength 2
  s = answer(s, "lookout"); // p2, strength 3: reveals two, skipping the revealed one
  // The enemy's reaction (the unrevealed bellow) left the hand; the rest keep their flags.
  expect(s.enemy.hand).toEqual(["ogre_stomp_a", "ogre_stomp_b", "ogre_stomp_a"]);
  expect(s.enemy.revealed).toEqual([true, true, true]);
});

test("a player's view never includes a hidden enemy domino's identity", () => {
  const s = setup(["kindle"], ["jab"], ["ogre_stomp_a", "ogre_gulp_b"]);
  s.enemy.revealed = [true, false];
  const before = JSON.stringify(s);
  const v = getView(s, "p2");
  expect(JSON.stringify(s)).toBe(before); // input untouched
  expect(v.enemy.hand).toEqual([{ revealed: true, domino: "ogre_stomp_a" }, { revealed: false }]);
  expect(v).not.toHaveProperty("rng");
  expect(v.enemy).not.toHaveProperty("deck");
  expect(v.enemy.deckList).toContain("ogre_gulp_b"); // the deck list is public
  expect(v.players[0].hand).toEqual(["kindle"]); // open hands
});

test("Reflect after a player's damage domino damages the party at the Reflect's strength", () => {
  let s = setup(["splash"], ["kindle"], ["elite_reflect"]);
  s = opener(s, "splash"); // Gale
  s = answer(s, "kindle"); // enemy takes 2 x 1; Reflect answers at strength 2, no lap: party takes 2 x 2
  expect(s.enemy.health).toBe(98);
  expect(s.party.health).toBe(56);
});

test("the Auditor fires when a player repeats a spark, across an enemy pass, not on an enemy reaction", () => {
  let s = setup(["kindle", "hold_ember"], ["hold_ember"]);
  s.enemy.passives = [{ kind: "auditor" }];
  s.party.block = 1;
  s = opener(s, "kindle"); // Ember
  s = answer(s, "hold_ember"); // p2: history [Ember], nothing to repeat; the enemy passes
  expect(s.party).toMatchObject({ health: 60, block: 1 });
  s = answer(s, "hold_ember"); // p1 answers Ember again, at strength 2: 2 damage, block soaks 1
  expect(s.party).toMatchObject({ health: 59, block: 0 });

  // An enemy reaction answering the same spark as the previous entry does not fire it.
  let t = setup(["kindle"], ["hold_ember"], ["elite_slash"]);
  t.enemy.passives = [{ kind: "auditor" }];
  t = answer(opener(t, "kindle"), "hold_ember"); // history [Ember, Ember]; Slash hits for 4 x 2
  expect(t.party.health).toBe(52);
});

test("the Glutton heals once per lap increment, capped at max health", () => {
  let s = setup(["kindle", "splash"], ["jab", "kindle"]);
  s.enemy.passives = [{ kind: "glutton" }];
  s.enemy.health = 90;
  s = opener(s, "kindle");
  s = answer(s, "jab"); // 3 damage, then lap 2: +5
  expect(s.enemy.health).toBe(92);
  s = answer(s, "splash"); // 2 x 2 x 2 = 8
  s = answer(s, "kindle"); // 2 x 3 x 2 = 12, then lap 3: +5 even though p1 can't answer
  expect(s.enemy.health).toBe(77);
  expect(s.round).toBe(2);
});

test("a preview matches what playing the domino then does (Echo pending, Spectrum, lap 2)", () => {
  let s = setup(["brace", "prism"], ["echo_stone"]);
  s = answer(opener(s, "brace"), "echo_stone"); // Echo pending; the spark is back at p1 on lap 2
  const before = JSON.stringify(s);
  const [preview] = previewPlay(s, "p1", "prism");
  expect(JSON.stringify(s)).toBe(before); // a preview changes nothing
  const { state, events } = step(s, { type: "answer", domino: "prism" });
  const triggers = events.filter((e) => e.type === "trigger");
  // base 2 x (strength 2 + 2 different sparks) x lap 2 = 16, twice
  expect(preview).toMatchObject({ triggers: 2, value: 16, spectrumBonus: 2, strength: 2, lap: 2 });
  expect(triggers.map((e) => e.type === "trigger" && e.value)).toEqual([16, 16]);
  expect(state.enemy.health).toBe(s.enemy.health - preview.triggers * preview.value);
});

test("blessed spark: answers and enemy reactions made with it add 2 strength, other sparks add 1", () => {
  const s0 = setup(["parry", "splash"], ["lookout"], ["goblin_stab"]);
  s0.blessing = { spark: "Ember", strength: 2 };
  const s1 = opener(s0, "parry"); // the opener adds nothing, even though it outputs the blessed Ember
  expect(s1.chain.strength).toBe(0);
  expect(previewPlay(s1, "p2", "lookout")[0].strength).toBe(2); // previews include the blessing
  const plays: string[] = [];
  let s = s1;
  for (const domino of ["lookout", "splash"]) {
    const r = step(s, { type: "answer", domino });
    s = r.state;
    for (const e of r.events) if (e.type === "play") plays.push(`${e.seat}:${e.answeredSpark}:${e.strength}`);
  }
  // p2 answers Ember (+2), the enemy reacts to Ember (+2), p1 answers the enemy's Tide (+1).
  expect(plays).toEqual(["p2:Ember:2", "enemy:Ember:4", "p1:Tide:5"]);
});
