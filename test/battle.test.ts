import { expect, test } from "vitest";
import { applyChoice, createBattle, getPendingChoice } from "../src/engine/battle";
import type { BattleState } from "../src/engine/battle";
import type { Config, DeckList, Domino, Enemy } from "../src/engine/types";
import configJson from "../data/config.json";
import dominoesJson from "../data/dominoes.json";
import enemiesJson from "../data/enemies.json";
import starterDeckJson from "../data/starter-deck.json";

// JSON string literals widen to string, so a plain annotation fails on Spark.
// For the single-object config, satisfies still catches a missing key.
const config = configJson satisfies Record<keyof Config, unknown> as Config;
// Plus one test-only domino so two Echoes can follow each other (Echo Stone takes Gale).
const echoTide: Domino = { id: "echo_tide", name: "Echo Tide", intake: ["Tide"], output: ["Gale"], effect: { kind: "echo" } };
const dominoes = [...(dominoesJson as Domino[]), echoTide];
const enemies = enemiesJson as Enemy[];
const starterDeck: DeckList = starterDeckJson;

// A fresh battle (seats p1, p2, enemy) with hands set to known dominoes.
function setup(p1: string[], p2: string[], enemyHand: string[] = []): BattleState {
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
  });
  state.players[0].hand = p1;
  state.players[1].hand = p2;
  state.enemy.hand = enemyHand;
  return state;
}

function fuse(s: BattleState, domino: string): BattleState {
  return applyChoice(s, { type: "fuse", domino });
}
function answer(s: BattleState, domino: string): BattleState {
  return applyChoice(s, { type: "answer", domino });
}

test("scripted round: strength rises per answer, lap per return to the lead", () => {
  const s0 = setup(["kindle", "splash", "parry"], ["jab", "kindle"]);
  const before = JSON.stringify(s0);

  const s1 = fuse(s0, "kindle"); // Ember, strength 0
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
  const s = fuse(setup(["kindle"], ["parry"]), "kindle"); // p2 can't answer Ember
  expect(s.round).toBe(2);
  expect(s.players[1].hand).toContain("parry");
  expect(s.players[1].hand).toHaveLength(1 + config.playerDrawPerRound);
  expect(getPendingChoice(s)).toMatchObject({ type: "fuse", player: "p2" });
});

test("block absorbs damage before health, and resets at round end", () => {
  let s = setup(["kindle", "brace"], ["brace", "shelter"], ["ogre_stomp_a"]);
  s = fuse(s, "kindle");
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
  const s = answer(fuse(s0, "kindle"), "jab");
  expect(s.result).toBe("won");
  expect(s.nextLead).toBe("p2");
  expect(getPendingChoice(s)).toBeNull();
  expect(s.players[0].hand).toEqual(["jab"]); // p1 never got another turn
});

test("enemy at its hand limit discards the oldest domino to make room, and keeps drawing", () => {
  const s0 = setup(["kindle"], ["parry"]);
  s0.enemy.hand = ["ogre_gulp_a", "ogre_gulp_b", "ogre_gulp_a", "ogre_gulp_b", "ogre_gulp_a"];
  s0.enemy.deck = ["ogre_bellow_a", "ogre_bellow_b", "ogre_stomp_a"];
  const s = fuse(s0, "kindle"); // p2 can't answer, round 2 starts with the draw
  expect(s.enemy.hand).toEqual(["ogre_gulp_b", "ogre_gulp_a", "ogre_bellow_a", "ogre_bellow_b", "ogre_stomp_a"]);
  expect(s.enemy.discard).toEqual(["ogre_gulp_a", "ogre_gulp_b", "ogre_gulp_a"]);
});

test("the enemy plays the leftmost matching domino", () => {
  const s0 = setup(["kindle", "brace"], ["brace"], ["ogre_gulp_a", "ogre_stomp_a", "ogre_stomp_b"]);
  const s = answer(fuse(s0, "kindle"), "brace"); // Gale: both Stomps match
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
  const s = fuse(s0, "kindle"); // chain ends at once
  expect(s.party).toMatchObject({ health: 58, block: 0 }); // 3 + 3, block soaked 4
  expect(s.enemy.health).toBe(93);
  expect(s.enemy.hand).toHaveLength(3);
});

test("Amplify adds its bonus on top of the normal +1", () => {
  let s = setup(["kindle", "splash", "bellows"], ["jab", "kindle", "shelter"]);
  s = fuse(s, "kindle");
  for (const d of ["jab", "splash", "kindle"]) s = answer(s, d); // strength 3
  s = answer(s, "bellows"); // 3 + 1 + 2
  expect(s.chain.strength).toBe(6);
});

test("Echo, Echo, then a damage domino triggers 3 times at the same strength", () => {
  let s = setup(["brace", "echo_tide", "brace"], ["echo_stone", "kindle"]);
  s = fuse(s, "brace");
  for (const d of ["echo_stone", "echo_tide", "kindle"]) s = answer(s, d);
  expect(s.enemy.health).toBe(100 - 3 * (2 * 3 * 2)); // base 2, strength 3, lap 2
  expect(s.chain.strength).toBe(3);
});

test("Mimic after an enemy damage domino damages the enemy", () => {
  let s = setup(["kindle", "mimic"], ["brace"], ["ogre_stomp_a"]);
  s = fuse(s, "kindle");
  s = answer(s, "brace"); // block 4; Stomp: 3 x 2 hits the party
  expect(s.party.health).toBe(58);
  s = answer(s, "mimic"); // copies the Stomp toward the enemy: 3 x 3 x lap 2
  expect(s.enemy.health).toBe(100 - 18);
  expect(s.party.health).toBe(58);
});

test("Spectrum adds the number of different sparks in the history to its strength", () => {
  let s = fuse(setup(["kindle"], ["prism", "jab"]), "kindle");
  s.players[0].hand = ["wildcard"];
  s.chain.sparks = ["Tide"];
  s.chain.strength = 4;
  s.chain.history = ["Ember", "Tide", "Gale", "Ember"];
  s = answer(s, "prism"); // 3 different sparks: 2 x (5 + 3) x lap 1
  expect(s.enemy.health).toBe(100 - 16);
  expect(s.chain.strength).toBe(5);
});
