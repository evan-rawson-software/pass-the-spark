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

const flush = () => new Promise((r) => setTimeout(r, 0));

test("host and two clients vote, then play a round; views match, out-of-turn choice is rejected", async () => {
  const content = loadContent();
  const network = createMemoryNetwork();
  const code = generateRoomCode();
  const hostMessages: HostMessage[] = [];
  const host = await createHost({
    transport: network.createTransport(),
    roomCode: code,
    buildId: BUILD_ID,
    hostName: "Host",
    content,
    onLocalMessage: (m) => hostMessages.push(m),
  });
  const messages: HostMessage[][] = [[], []];
  const clients: Client[] = [];
  for (let i = 0; i < 2; i++) {
    clients.push(
      await joinRoom({
        transport: network.createTransport(),
        roomCode: code,
        buildId: BUILD_ID,
        name: "Friend " + (i + 1),
        token: "token" + i,
        onMessage: (m) => messages[i].push(m),
      }),
    );
  }
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
  host.close();
});
