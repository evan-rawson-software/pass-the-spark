import { expect, test } from "vitest";
import { createBattle, step } from "../src/engine/battle";
import type { Choice } from "../src/engine/battle";
import { getEventsView } from "../src/engine/events";
import { loadContent } from "../src/engine/content";

const { config, dominoes, enemies, starterDeck } = loadContent();

test("scripted round: events come out in order, and a leftover is revealed as it goes off", () => {
  let s = createBattle({
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
  s.players[0].hand = ["kindle", "splash"];
  s.players[1].hand = ["jab"];
  s.enemy.hand = ["ogre_stomp_a"];
  s.enemy.revealed = [false];

  const script: Choice[] = [
    { type: "opener", domino: "kindle" },
    { type: "answer", domino: "jab" },
    { type: "answer", domino: "splash" },
  ];
  const events = script.flatMap((c) => {
    const r = step(s, c);
    s = r.state;
    return r.events;
  });
  const pass = (from: string, to: string) => ({ type: "pass", from, to });
  expect(events.slice(0, 19)).toMatchObject([
    { type: "opener", player: "p1", domino: "kindle", sparks: ["Ember"] },
    pass("p1", "p2"),
    { type: "play", seat: "p2", domino: "jab", answeredSpark: "Ember", strength: 1, lap: 1 },
    { type: "trigger", seat: "p2", domino: "jab", index: 0, value: 3 },
    { type: "damage", side: "enemy", amount: 3, blocked: 0 },
    pass("p2", "enemy"),
    { type: "enemyNoReaction", sparks: ["Tide"] },
    pass("enemy", "p1"),
    { type: "lapUp", lap: 2 },
    { type: "play", seat: "p1", domino: "splash", answeredSpark: "Tide", strength: 2, lap: 2 },
    { type: "trigger", seat: "p1", domino: "splash", index: 0, value: 8 },
    { type: "damage", side: "enemy", amount: 8, blocked: 0 },
    pass("p1", "p2"),
    { type: "chainEnd", reason: "cannotAnswer" },
    { type: "reveal", positions: [0] },
    { type: "leftover", domino: "ogre_stomp_a", position: 0 },
    { type: "trigger", seat: "enemy", domino: "ogre_stomp_a", value: 3 },
    { type: "damage", side: "party", amount: 3, blocked: 0 },
    { type: "blockReset" },
  ]);
  expect(events.slice(19).map((e) => e.type)).toEqual(["roundStart", "draw", "draw", "draw"]);
  expect(events[19]).toMatchObject({ round: 2, lead: "p2" });
  expect(events[22]).toEqual({ type: "draw", seat: "enemy", count: 3 });

  // Going off revealed the leftover, and the state agrees.
  expect(s.enemy.revealed[0]).toBe(true);
  expect(getEventsView(events, "p1")).toEqual(events);
});
