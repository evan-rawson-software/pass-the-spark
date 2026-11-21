import { expect, test } from "vitest";
import { getPlayerChoices } from "../src/engine/battle";
import { loadContent } from "../src/engine/content";
import { getView } from "../src/engine/view";
import type { BattleView } from "../src/engine/view";
import { BUILD_ID } from "../src/net/buildId";
import { joinRoom } from "../src/net/client";
import type { Client } from "../src/net/client";
import { createHost } from "../src/net/host";
import { COLOUR_IDS } from "../src/net/look";
import { createMemoryNetwork } from "../src/net/memoryTransport";
import type { HostMessage } from "../src/net/protocol";
import { generateRoomCode } from "../src/net/room";
import type { SavedRoom } from "../src/net/room";

const flush = () => new Promise((r) => setTimeout(r, 0));

test("host and two clients vote, then build a round; two place on the same end at once and the second is refused; views match; unlocks reach the run and experience comes back", async () => {
  const content = loadContent();
  const network = createMemoryNetwork();
  const code = generateRoomCode();
  let hostMessages: HostMessage[] = [];
  let saved: SavedRoom | null = null;
  const host = await createHost({
    transport: network.createTransport(),
    roomCode: code,
    buildId: BUILD_ID,
    hostName: "Host",
    content,
    unlocks: () => ["echo"],
    onLocalMessage: (m) => hostMessages.push(m),
    onSave: (room) => (saved = room),
  });
  const messages: HostMessage[][] = [[], []];
  // What each client's profile says it has unlocked. The first one sends junk and a repeat, which the host cleans.
  const unlocks = [["boostTwo", "bogus", "boostTwo"], [] as string[]];
  const clients: Client[] = [];
  const joinClient = async (i: number): Promise<Client> =>
    joinRoom({
      transport: network.createTransport(),
      roomCode: code,
      buildId: BUILD_ID,
      name: "Friend " + (i + 1),
      token: "token" + i,
      unlocks: () => unlocks[i],
      onMessage: (m) => {
        messages[i].push(m);
        if (m.type === "experience") unlocks[i] = ["advancedSparks", "boostTwo"]; // the profile has levelled up
      },
    });
  for (let i = 0; i < 2; i++) clients.push(await joinClient(i));
  await flush();
  expect(clients.map((c) => c.seat)).toEqual(["p2", "p3"]);

  host.start(7);
  await flush();

  // The run opens with a vote on the first floor; everyone votes for the first stop.
  const vote = (hostMessages.filter((m) => m.type === "runUpdate").at(-1) as { view: { window: string } }).view.window;
  host.submitLocalRun({ type: "vote", node: 0 }, vote);
  for (const c of clients) c.sendRunChoice({ type: "vote", node: 0 }, vote);
  await flush();

  // Everyone builds at the same time. The host opens the board; then two players each try to place on
  // an end they can both reach, in the same moment. The first to arrive is applied; the second is refused.
  const lastView = (): BattleView => (hostMessages.filter((m) => m.type === "update").at(-1) as { view: BattleView }).view;
  const open = getPlayerChoices(lastView(), "p1")!.plays.find((o) => o.ends.length === 0)!;
  host.submitLocal({ type: "play", player: "p1", domino: open.domino });
  await flush();
  const [a, b] = clients;
  const options = (c: Client) => getPlayerChoices(c.view!, c.seat!)!.plays.flatMap((o) => o.ends.map((end) => ({ domino: o.domino, end })));
  const bOptions = options(b);
  const same = options(a).flatMap((x) => bOptions.filter((y) => y.end === x.end).map((y) => [x, y]))[0];
  expect(same).toBeDefined();
  const refusedBefore = messages.map((list) => list.filter((m) => m.type === "error").length);
  a.sendChoice({ type: "play", player: a.seat!, domino: same[0].domino, end: same[0].end });
  b.sendChoice({ type: "play", player: b.seat!, domino: same[1].domino, end: same[1].end });
  await flush();
  const errors = messages.map((list) => list.filter((m) => m.type === "error"));
  expect(errors[0].length).toBe(refusedBefore[0]);
  expect(errors[1].length).toBe(refusedBefore[1] + 1);
  expect(hostMessages.filter((m) => m.type === "error")).toEqual([]);
  // The second player's domino stays in their hand, and a choice naming another seat is refused.
  expect(b.view!.players.find((p) => p.id === b.seat)!.hand).toContain(same[1].domino);
  b.sendChoice({ type: "ready", player: a.seat!, ready: true });
  await flush();
  expect(messages[1].filter((m) => m.type === "error").length).toBe(refusedBefore[1] + 2);

  // Everyone is Ready: the cascade fires on the last Ready and round 2 begins.
  host.submitLocal({ type: "ready", player: "p1", ready: true });
  for (const c of clients) c.sendChoice({ type: "ready", player: c.seat!, ready: true });
  await flush();
  const hostView = lastView();
  expect(hostView.round).toBeGreaterThan(1);

  // Each player's view is exactly what the engine's getView gives that player from the host's state.
  const state = host.getState()!;
  expect(hostView).toEqual(getView(state, "p1"));
  for (const c of clients) {
    expect(c.view).toEqual(getView(state, c.seat!));
    expect(JSON.stringify(c.view)).not.toContain('"rng"');
  }

  // Each seat's unlocks reached the run: the host's own, the cleaned list, and none.
  const firstRoom = saved as SavedRoom | null;
  expect(firstRoom!.run!.unlocks).toEqual({ p1: ["echo"], p2: ["boostTwo"], p3: [] });

  // The host reloads in the middle of the battle, with the party one hit from defeat on floor 3.
  // The clients rejoin with other unlocks, but the run keeps the ones it started with.
  host.close();
  clients.forEach((c) => c.close());
  const run = firstRoom!.run!;
  run.position!.floor = 3;
  run.battle!.party.health = 1;
  run.battle!.enemy.health = 1000; // the 5-domino first draw lets the scripted play win the fight otherwise
  run.health = 1;
  hostMessages = [];
  unlocks[0] = ["spectrum"];
  const host2 = await createHost({
    transport: network.createTransport(),
    roomCode: code,
    buildId: BUILD_ID,
    hostName: "Host",
    content,
    unlocks: () => ["double"],
    onLocalMessage: (m) => hostMessages.push(m),
    onSave: (room) => (saved = room),
    resume: firstRoom!,
  });
  const rejoined = [await joinClient(0), await joinClient(1)];
  host2.announce();
  await flush();
  // Play until the party falls: every player is sent the experience (10 a floor for the 2 floors cleared).
  const experience = () => hostMessages.filter((m) => m.type === "experience");
  for (let i = 0; i < 300 && experience().length === 0; i++) {
    host2.submitLocal({ type: "ready", player: "p1", ready: true });
    for (const c of rejoined) c.sendChoice({ type: "ready", player: c.seat!, ready: true });
    await flush();
  }
  await flush();
  expect((saved as SavedRoom | null)?.run?.unlocks).toEqual({ p1: ["echo"], p2: ["boostTwo"], p3: [] });
  expect(experience()).toEqual([{ type: "experience", runId: expect.any(String), gained: 20 }]);
  for (const list of messages) expect(list.filter((m) => m.type === "experience")).toEqual([experience()[0]]);

  // Back in the lobby, the client's new unlocks count for the next run.
  host2.backToLobby();
  await flush();
  host2.start(9);
  expect((saved as SavedRoom | null)?.run?.unlocks).toEqual({ p1: ["double"], p2: ["advancedSparks", "boostTwo"], p3: ["advancedSparks", "boostTwo"] });
  rejoined.forEach((c) => c.close());
  host2.close();
});

test("a joiner with the host's colour gets the first free one, both screens agree, and a look with a taken colour is ignored", async () => {
  const network = createMemoryNetwork();
  const code = generateRoomCode();
  const hostMessages: HostMessage[] = [];
  const clientMessages: HostMessage[] = [];
  const first = COLOUR_IDS[0];
  const host = await createHost({
    transport: network.createTransport(),
    roomCode: code,
    buildId: BUILD_ID,
    hostName: "Host",
    content: loadContent(),
    unlocks: () => [],
    look: { colour: first, hat: "pointed", robe: "plain" },
    onLocalMessage: (m) => hostMessages.push(m),
  });
  const client = await joinRoom({
    transport: network.createTransport(),
    roomCode: code,
    buildId: BUILD_ID,
    name: "Friend",
    token: "token",
    unlocks: () => [],
    look: () => ({ colour: first, hat: "hood", robe: "runic" }), // the same saved colour as the host
    onMessage: (m) => clientMessages.push(m),
  });
  await flush();
  const lobbies = (list: HostMessage[]) => list.filter((m) => m.type === "lobby");
  const looks = [
    ["p1", { colour: first, hat: "pointed", robe: "plain" }],
    ["p2", { colour: COLOUR_IDS[1], hat: "hood", robe: "runic" }],
  ];
  const lastLobby = (list: HostMessage[]) => (lobbies(list).at(-1) as Extract<HostMessage, { type: "lobby" }>).players.map((p) => [p.seat, p.look]);
  expect(lastLobby(clientMessages)).toEqual(looks);
  expect(lastLobby(hostMessages)).toEqual(looks);

  // The joiner asks for the host's colour: ignored, and the lobby is sent again, unchanged.
  const before = lobbies(clientMessages).length;
  client.sendLook({ colour: first, hat: "brim", robe: "mantle" });
  await flush();
  expect(lobbies(clientMessages).length).toBe(before + 1);
  expect(lastLobby(clientMessages)).toEqual(looks);

  client.close();
  host.close();
});
