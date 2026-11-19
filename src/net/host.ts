// The host: holds the BattleState and is the only place the engine runs.
// Clients send choices; the host checks each one, applies it, and sends every player
// their own view and events. The full BattleState never leaves this file.

import { createBattleWithEvents, getPendingChoice, step } from "../engine/battle";
import type { BattleState, Choice, Content, StepResult } from "../engine/battle";
import type { Config, DeckList } from "../engine/types";
import { getEventsView } from "../engine/events";
import type { GameEvent } from "../engine/events";
import { getView } from "../engine/view";
import type { ClientMessage, HostMessage } from "./protocol";
import { hostPeerId } from "./room";
import type { Connection, Transport } from "./transport";

export const MAX_SEATS = 4;
export const MAX_NAME_LENGTH = 24;

export interface HostOptions {
  transport: Transport;
  roomCode: string;
  buildId: string;
  hostName: string;
  config: Config;
  content: Content;
  starterDeck: DeckList;
  enemyId: string;
  // Called with what the host's own player (seat p1) would receive over the network.
  onLocalMessage: (message: HostMessage) => void;
}

interface Member {
  seat: string;
  name: string;
  token: string | null; // null for the host's own seat: no remote token can ever match it
  connection: Connection | null; // null for the host's own seat, which is local
  connected: boolean;
}

export interface Host {
  // Start the battle with whoever has joined. The seed comes from the caller.
  start(seed: number): void;
  // The host's own player submits a choice, checked like everyone else's.
  submitLocal(choice: Choice): void;
  close(): void;
  // For tests only: the host's BattleState.
  getStateForTest(): BattleState | null;
}

export async function createHost(options: HostOptions): Promise<Host> {
  const { transport, buildId } = options;
  const members: Member[] = [
    { seat: "p1", name: options.hostName, token: null, connection: null, connected: true },
  ];
  let state: BattleState | null = null;

  function deliver(m: Member, message: HostMessage): void {
    if (m.connection === null) options.onLocalMessage(message);
    else if (m.connection.status === "open") m.connection.send(message);
  }

  // The one way game data reaches a player: their own view plus their own events.
  function sendToPlayer(m: Member, events: GameEvent[]): void {
    if (state === null) return;
    deliver(m, { type: "update", view: getView(state, m.seat), events: getEventsView(events, m.seat) });
  }

  function sendToAll(events: GameEvent[]): void {
    for (const m of members) sendToPlayer(m, events);
    sendPauseIfNeeded();
  }

  function sendPauseIfNeeded(): void {
    if (state === null) return;
    const pending = getPendingChoice(state);
    const waiting = pending ? members.find((m) => m.seat === pending.player) : undefined;
    if (waiting && !waiting.connected) {
      for (const m of members) deliver(m, { type: "paused", waitingFor: waiting.name });
    }
  }

  function sendLobby(): void {
    const message: HostMessage = {
      type: "lobby",
      players: members.map((m) => ({ seat: m.seat, name: m.name })),
      seats: members.map((m) => m.seat),
      enemyId: options.enemyId,
    };
    for (const m of members) deliver(m, message);
  }

  // Every choice, local or remote, goes through here. The seat comes from the connection
  // the choice arrived on and is never read from the message.
  function handleChoice(m: Member, choice: Choice): void {
    if (state === null) return deliver(m, { type: "error", message: "the battle has not started" });
    const pending = getPendingChoice(state);
    if (pending === null) return deliver(m, { type: "error", message: "the battle is over" });
    if (pending.player !== m.seat) return deliver(m, { type: "error", message: "not your turn" });
    let result: StepResult;
    try {
      result = step(state, choice);
    } catch (e) {
      return deliver(m, { type: "error", message: "choice rejected: " + (e instanceof Error ? e.message : "invalid") });
    }
    state = result.state;
    sendToAll(result.events);
  }

  function handleMessage(connection: Connection, raw: unknown): void {
    const msg = raw as Partial<ClientMessage> | null;
    const reply = (message: HostMessage) => connection.send(message);
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") {
      return reply({ type: "error", message: "bad message" });
    }
    const known = members.find((x) => x.connection === connection);
    if (msg.type === "hello") {
      if (known) return reply({ type: "error", message: "already joined" });
      if (msg.buildId !== buildId) {
        return reply({ type: "refused", reason: "Different version of the game. Refresh the page." });
      }
      if (typeof msg.name !== "string" || typeof msg.token !== "string" || msg.token === "") {
        return reply({ type: "error", message: "bad hello" });
      }
      const name = msg.name.trim().slice(0, MAX_NAME_LENGTH) || "Player";
      const token = msg.token;
      let me = members.find((x) => x.token !== null && x.token === token);
      if (me) {
        // A returning player gets their seat back.
        me.connection = connection;
        me.connected = true;
        me.name = name;
      } else if (state !== null) {
        return reply({ type: "refused", reason: "The game has already started." });
      } else if (members.length >= MAX_SEATS) {
        return reply({ type: "refused", reason: "The room is full." });
      } else {
        me = { seat: "p" + (members.length + 1), name, token, connection, connected: true };
        members.push(me);
      }
      reply({ type: "welcome", seat: me.seat, token });
      if (state === null) sendLobby();
      else sendToAll([]);
    } else if (msg.type === "choice") {
      if (!known) return reply({ type: "error", message: "say hello first" });
      handleChoice(known, msg.choice as Choice);
    } else {
      reply({ type: "error", message: "unknown message type" });
    }
  }

  await transport.listen(hostPeerId(options.roomCode), (connection) => {
    connection.onReceive((raw) => handleMessage(connection, raw));
    connection.onStatus((status) => {
      if (status !== "closed") return;
      const m = members.find((x) => x.connection === connection);
      if (!m) return;
      m.connected = false;
      if (state === null) {
        // Not started: free the seat. Seats are join order, so renumber.
        members.splice(members.indexOf(m), 1);
        members.forEach((x, i) => {
          const seat = "p" + (i + 1);
          if (x.seat === seat) return;
          x.seat = seat;
          // Tell that player their new seat.
          if (x.connection && x.token !== null) deliver(x, { type: "welcome", seat, token: x.token });
        });
        sendLobby();
      } else sendPauseIfNeeded();
    });
  });

  return {
    start(seed) {
      if (state !== null) throw new Error("already started");
      const seats = members.map((m) => m.seat);
      const result = createBattleWithEvents({
        config: options.config,
        content: options.content,
        players: seats.map((id) => ({ id, deck: options.starterDeck })),
        seatOrder: [...seats, "enemy"],
        enemyId: options.enemyId,
        seed,
      });
      state = result.state;
      sendToAll(result.events);
    },
    submitLocal(choice) {
      handleChoice(members[0], choice);
    },
    close() {
      transport.close();
    },
    getStateForTest() {
      return state;
    },
  };
}
