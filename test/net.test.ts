import { expect, test } from "vitest";
import { getPendingChoice } from "../src/engine/battle";
import type { Choice } from "../src/engine/battle";
import { loadContent } from "../src/engine/content";
import { getView } from "../src/engine/view";
import type { BattleView } from "../src/engine/view";
import { BUILD_ID } from "../src/net/buildId";
import { joinRoom } from "../src/net/client";
import type { Client } from "../src/net/client";
import { createHost } from "../src/net/host";
import { createMemoryNetwork } from "../src/net/memoryTransport";
import type { HostMessage } from "../src/net/protocol";
import { generateRoomCode } from "../src/net/room";
import type { SavedRoom } from "../src/net/room";

const flush = () => new Promise((r) => setTimeout(r, 0));

test("host and two clients vote, then play a round; views match, out-of-turn choice is rejected; unlocks reach the run and experience comes back", async () => {
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
  const unlocks = [["lookout", "bogus", "lookout"], [] as string[]];
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
        if (m.type === "experience") unlocks[i] = ["lookout", "advancedSparks"]; // the profile has levelled up
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

  // Play until round 2 begins. What to play comes from the view alone.
  let hostView = (hostMessages.filter((m) => m.type === "update").at(-1) as { view: BattleView }).view;
  let outOfTurnChecked = false;
  while (hostView.round === 1 && hostView.phase !== "over") {
    const seat = hostView.seat;
    const pending = getPendingChoice(hostView);
    if (!pending) break;
    const choice: Choice =
      pending.type === "opener"
        ? { type: "opener", domino: pending.dominoes[0] }
        : { type: "answer", domino: pending.options[0].domino, spark: pending.options[0].sparks[0] };

    if (!outOfTurnChecked) {
      // Someone else tries to play on this seat's turn.
      const other = clients.find((c) => c.seat !== seat);
      const before = messages[clients.indexOf(other!)].length;
      other!.sendChoice(choice);
      await flush();
      const reply = messages[clients.indexOf(other!)].slice(before);
      expect(reply).toEqual([{ type: "error", message: "not your turn" }]);
      outOfTurnChecked = true;
    }

    if (seat === "p1") host.submitLocal(choice);
    else clients.find((c) => c.seat === seat)!.sendChoice(choice);
    await flush();
    hostView = (hostMessages.filter((m) => m.type === "update").at(-1) as { view: BattleView }).view;
  }
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
  expect(firstRoom!.run!.unlocks).toEqual({ p1: ["echo"], p2: ["lookout"], p3: [] });

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
    unlocks: () => ["mimic"],
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
    const view = (hostMessages.filter((m) => m.type === "update").at(-1) as { view: BattleView }).view;
    const pending = getPendingChoice(view);
    if (!pending) break;
    const choice: Choice =
      pending.type === "opener"
        ? { type: "opener", domino: pending.dominoes[0] }
        : { type: "answer", domino: pending.options[0].domino, spark: pending.options[0].sparks[0] };
    if (view.seat === "p1") host2.submitLocal(choice);
    else rejoined.find((c) => c.seat === view.seat)!.sendChoice(choice);
    await flush();
  }
  await flush();
  expect((saved as SavedRoom | null)?.run?.unlocks).toEqual({ p1: ["echo"], p2: ["lookout"], p3: [] });
  expect(experience()).toEqual([{ type: "experience", runId: expect.any(String), gained: 20 }]);
  for (const list of messages) expect(list.filter((m) => m.type === "experience")).toEqual([experience()[0]]);

  // Back in the lobby, the client's new unlocks count for the next run.
  host2.backToLobby();
  await flush();
  host2.start(9);
  expect((saved as SavedRoom | null)?.run?.unlocks).toEqual({ p1: ["mimic"], p2: ["lookout", "advancedSparks"], p3: ["lookout", "advancedSparks"] });
  rejoined.forEach((c) => c.close());
  host2.close();
});
