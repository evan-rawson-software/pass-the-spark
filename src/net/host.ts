// The host: holds the BattleState and is the only place the engine runs.
// Clients send choices; the host checks each one, applies it, and sends every player
// their own view and events. The full BattleState never leaves this file.

import { createBattleWithEvents, getPendingChoice, step } from "../engine/battle";
import type { BattleState, Choice, Content, StepResult } from "../engine/battle";
import type { Config, DeckList } from "../engine/types";
import { getEventsView } from "../engine/events";
import type { GameEvent } from "../engine/events";
import { getView } from "../engine/view";
import { REFUSED_BUILD, REFUSED_KICKED } from "./protocol";
import type { ClientMessage, HostMessage } from "./protocol";
import { hostPeerId } from "./room";
import type { SavedRoom } from "./room";
import type { Connection, Transport } from "./transport";

export const MAX_SEATS = 4;
export const MIN_SEATS = 3;
export const MAX_NAME_LENGTH = 24;
// How long the game waits for an away player on their turn before the host may play for them.
export const PLAY_FOR_DELAY_MS = 60_000;

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
  // Resume a room that was saved earlier: same seats and tokens, same battle. Players reconnect on their own.
  resume?: SavedRoom;
  // Called with the room after every lobby change and every step, and with null when the host closes the room.
  onSave?: (room: SavedRoom | null) => void;
}

interface Member {
  seat: string;
  name: string;
  token: string | null; // null for the host's own seat: no remote token can ever match it
  local: boolean; // the host's own seat: no connection, messages go to onLocalMessage
  connection: Connection | null; // null for the host's own seat, and for a saved seat nobody has reclaimed yet
  connected: boolean;
}

export interface Host {
  // Start the battle with whoever has joined. The seed comes from the caller.
  // Needs MIN_SEATS players unless allowFewer is set (debug panel).
  start(seed: number, allowFewer?: boolean): void;
  // Lobby actions. They are methods on the host, not messages, so a client cannot trigger them.
  // They do nothing once the battle has started.
  moveSeat(seat: string, direction: -1 | 1): void;
  kick(seat: string): void;
  setEnemy(enemyId: string): void;
  // The host's own player submits a choice, checked like everyone else's. It counts for a seat the
  // host is playing for when that seat's turn is up.
  submitLocal(choice: Choice): void;
  // After the wait for an away player has run out: take over that seat until the player returns.
  playFor(seat: string): void;
  // After a resume: send the host's own player the lobby or the battle as it stands.
  announce(): void;
  close(): void;
  // After a battle: back to the lobby with the same seats. Everyone is sent the lobby.
  backToLobby(): void;
  // The host's BattleState. Only for code running on the host's own machine (debug panel, tests);
  // it is never sent to a client.
  getState(): BattleState | null;
}

export async function createHost(options: HostOptions): Promise<Host> {
  const { transport, buildId } = options;
  const saved = options.resume;
  const members: Member[] = saved
    ? saved.members.map((x) => ({
        seat: x.seat,
        name: x.name,
        token: x.token,
        local: x.token === null, // only the host's own seat has no token
        connection: null,
        connected: x.token === null,
      }))
    : [{ seat: "p1", name: options.hostName, token: null, local: true, connection: null, connected: true }];
  let state: BattleState | null = saved?.state ?? null;
  let enemyId = saved?.enemyId ?? options.enemyId;
  const controlled = new Set<string>(); // away seats the host is playing for
  let pauseSeat: string | null = null; // the away seat the game is waiting on
  let pauseTimer: ReturnType<typeof setTimeout> | null = null;
  let playForReady = false; // the wait on pauseSeat has run out

  function deliver(m: Member, message: HostMessage): void {
    if (m.local) options.onLocalMessage(message);
    else if (m.connection !== null && m.connection.status === "open") m.connection.send(message);
  }

  // Taken only after a step has completed (and on lobby changes), so a resume never replays half a step.
  function save(): void {
    options.onSave?.({
      roomCode: options.roomCode,
      buildId,
      enemyId,
      members: members.map((m) => ({ seat: m.seat, name: m.name, token: m.token })),
      state,
    });
  }

  // The one way game data reaches a player: their own view plus their own events.
  function sendToPlayer(m: Member, events: GameEvent[]): void {
    if (state === null) return;
    deliver(m, { type: "update", view: getView(state, m.seat), events: getEventsView(events, m.seat) });
  }

  function sendToAll(events: GameEvent[]): void {
    for (const m of members) sendToPlayer(m, events);
    sendStatus();
  }

  function presenceMessage(): HostMessage {
    return { type: "presence", players: members.map((m) => ({ seat: m.seat, name: m.name, away: !m.connected })) };
  }

  function clearPause(): void {
    if (pauseTimer !== null) clearTimeout(pauseTimer);
    pauseTimer = null;
    pauseSeat = null;
    playForReady = false;
  }

  // Who is here, whether the game is waiting on someone who is away, and (for the host) who it is
  // playing for. Sent after every step and whenever someone leaves or returns.
  function sendStatus(): void {
    if (state === null) return;
    const pending = getPendingChoice(state);
    const turn = pending ? members.find((m) => m.seat === pending.player) : undefined;
    const waiting = turn && !turn.connected && !controlled.has(turn.seat) ? turn : undefined;
    if (!waiting) clearPause();
    else if (pauseSeat !== waiting.seat) {
      clearPause();
      pauseSeat = waiting.seat;
      pauseTimer = setTimeout(() => {
        playForReady = true;
        sendStatus();
      }, PLAY_FOR_DELAY_MS);
    }
    const presence = presenceMessage();
    for (const m of members) {
      deliver(m, presence);
      deliver(m, {
        type: "paused",
        waitingFor: waiting?.name ?? null,
        ...(m.local && waiting && playForReady ? { playFor: waiting.seat } : {}),
      });
      if (m.local) deliver(m, { type: "playing-for", seat: turn && controlled.has(turn.seat) ? turn.seat : null });
    }
  }

  function lobbyMessage(): HostMessage {
    return {
      type: "lobby",
      players: members.map((m) => ({ seat: m.seat, name: m.name, away: !m.connected })),
      seats: members.map((m) => m.seat),
      enemyId,
    };
  }

  function sendLobby(): void {
    const message = lobbyMessage();
    for (const m of members) deliver(m, message);
    save();
  }

  // Seats are list order: p1, p2, ... Tell anyone whose seat changed.
  function renumber(): void {
    members.forEach((x, i) => {
      const seat = "p" + (i + 1);
      if (x.seat === seat) return;
      x.seat = seat;
      deliver(x, { type: "welcome", seat, token: x.token ?? "" });
    });
  }

  // Every choice, local or remote, goes through here. The seat comes from the connection
  // the choice arrived on and is never read from the message.
  // `m` is the seat the choice is for; errors go to `from` (the host's own player when it plays for a seat).
  function handleChoice(m: Member, choice: Choice, from: Member = m): void {
    if (state === null) return deliver(from, { type: "error", message: "the battle has not started" });
    const pending = getPendingChoice(state);
    if (pending === null) return deliver(from, { type: "error", message: "the battle is over" });
    if (pending.player !== m.seat) return deliver(from, { type: "error", message: "not your turn" });
    let result: StepResult;
    try {
      result = step(state, choice);
    } catch (e) {
      return deliver(from, { type: "error", message: "choice rejected: " + (e instanceof Error ? e.message : "invalid") });
    }
    state = result.state;
    save();
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
        return reply({ type: "refused", reason: REFUSED_BUILD });
      }
      if (typeof msg.name !== "string" || typeof msg.token !== "string" || msg.token === "") {
        return reply({ type: "error", message: "bad hello" });
      }
      const name = msg.name.trim().slice(0, MAX_NAME_LENGTH) || "Player";
      const token = msg.token;
      let me = members.find((x) => x.token !== null && x.token === token);
      if (me) {
        // A returning player gets their seat back (and the host stops playing for it).
        if (me.connection !== null && me.connection !== connection) me.connection.close();
        controlled.delete(me.seat);
        me.connection = connection;
        me.connected = true;
        me.name = name;
      } else if (state !== null) {
        return reply({ type: "refused", reason: "The game has already started." });
      } else if (members.length >= MAX_SEATS) {
        return reply({ type: "refused", reason: "The room is full." });
      } else {
        me = { seat: "p" + (members.length + 1), name, token, local: false, connection, connected: true };
        members.push(me);
      }
      reply({ type: "welcome", seat: me.seat, token });
      if (state === null) sendLobby();
      else {
        // The current view straight away, with no events to replay; then everyone hears who is here.
        reply(presenceMessage());
        sendToPlayer(me, []);
        sendStatus();
      }
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
        // Not started: free the seat.
        members.splice(members.indexOf(m), 1);
        renumber();
        sendLobby();
      } else sendStatus();
    });
  });

  return {
    start(seed, allowFewer = false) {
      if (state !== null) throw new Error("already started");
      if (members.length < MIN_SEATS && !allowFewer) throw new Error("need " + MIN_SEATS + " players");
      const away = members.find((m) => !m.connected);
      if (away) throw new Error("waiting for " + away.name + " to reconnect");
      const seats = members.map((m) => m.seat);
      const result = createBattleWithEvents({
        config: options.config,
        content: options.content,
        players: seats.map((id) => ({ id, deck: options.starterDeck })),
        seatOrder: [...seats, "enemy"],
        enemyId,
        seed,
      });
      state = result.state;
      save();
      sendToAll(result.events);
    },
    moveSeat(seat, direction) {
      if (state !== null) return;
      const i = members.findIndex((x) => x.seat === seat);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= members.length) return;
      [members[i], members[j]] = [members[j], members[i]];
      renumber();
      sendLobby();
    },
    kick(seat) {
      if (state !== null) return;
      const m = members.find((x) => x.seat === seat);
      if (!m || m.local) return; // the host cannot kick itself
      members.splice(members.indexOf(m), 1);
      if (m.connection !== null && m.connection.status === "open") {
        m.connection.send({ type: "refused", reason: REFUSED_KICKED } satisfies HostMessage);
        m.connection.close();
      }
      renumber();
      sendLobby();
    },
    setEnemy(id) {
      if (state !== null || !options.content.enemies.some((e) => e.id === id)) return;
      enemyId = id;
      sendLobby();
    },
    submitLocal(choice) {
      const local = members.find((x) => x.local)!;
      const pending = state === null ? null : getPendingChoice(state);
      const target = pending !== null && controlled.has(pending.player) ? members.find((x) => x.seat === pending.player)! : local;
      handleChoice(target, choice, local);
    },
    playFor(seat) {
      if (!playForReady || pauseSeat !== seat) return;
      controlled.add(seat);
      sendStatus();
    },
    announce() {
      const local = members.find((x) => x.local)!;
      deliver(local, lobbyMessage());
      if (state !== null) {
        sendToPlayer(local, []);
        sendStatus();
      }
    },
    close() {
      clearPause();
      options.onSave?.(null);
      transport.close();
    },
    backToLobby() {
      if (state === null) return;
      state = null;
      controlled.clear();
      clearPause();
      sendLobby();
    },
    getState() {
      return state;
    },
  };
}
