// The host: holds the RunState and is the only place the engine runs.
// Clients send choices; the host checks each one, applies it, and sends every player
// their own views and events. The full RunState and BattleState never leave this file.

import { getPendingChoice, step } from "../engine/battle";
import type { BattleState, Choice } from "../engine/battle";
import type { Content } from "../engine/content";
import { getEventsView } from "../engine/events";
import type { GameEvent } from "../engine/events";
import { applyRunChoice, createRunWithEvents, getPendingRunChoices, getRunWindow, splitRunEvents } from "../engine/run";
import type { RunChoice, RunEvent, RunState, RunStepResult } from "../engine/run";
import { getRunView, getView } from "../engine/view";
import { REFUSED_BUILD, REFUSED_KICKED } from "./protocol";
import type { ClientMessage, HostMessage } from "./protocol";
import { hostPeerId } from "./room";
import type { SavedRoom } from "./room";
import type { Connection, Transport } from "./transport";

export const MAX_SEATS = 4;
export const MIN_SEATS = 3;
export const MAX_NAME_LENGTH = 24;
// How long the game waits for an away player before the host may play for them.
export const PLAY_FOR_DELAY_MS = 60_000;

export interface HostOptions {
  transport: Transport;
  roomCode: string;
  buildId: string;
  hostName: string;
  content: Content; // everything the run reads from data
  // Called with what the host's own player (seat p1) would receive over the network.
  onLocalMessage: (message: HostMessage) => void;
  // Resume a room that was saved earlier: same seats and tokens, same run. Players reconnect on their own.
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
  // Start the run with whoever has joined. The seed comes from the caller.
  // Needs MIN_SEATS players unless allowFewer is set (debug panel).
  start(seed: number, allowFewer?: boolean): void;
  // Lobby actions. They are methods on the host, not messages, so a client cannot trigger them.
  // They do nothing once the run has started.
  moveSeat(seat: string, direction: -1 | 1): void;
  kick(seat: string): void;
  // The host's own player submits a battle choice, checked like everyone else's. It counts for a seat
  // the host is playing for when that seat's turn is up.
  submitLocal(choice: Choice): void;
  // The host's own player submits any other run choice. `at` is RunView.window of the screen it
  // was made on; seat is the seat it is for (the host's own, or one it is playing for).
  submitLocalRun(choice: RunChoice, at: string, seat?: string): void;
  // After the wait for an away player has run out: take over that seat until the player returns.
  playFor(seat: string): void;
  // After a resume: send the host's own player the lobby or the run as it stands.
  announce(): void;
  close(): void;
  // After a run: back to the lobby with the same seats. Everyone is sent the lobby.
  backToLobby(): void;
  // The host's BattleState, if one is being fought. Only for code running on the host's own machine
  // (debug panel, tests); it is never sent to a client.
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
  let run: RunState | null = saved?.run ?? null;
  const controlled = new Set<string>(); // away seats the host is playing for
  let pauseSeats: string[] = []; // the away seats the game is waiting on
  let pauseTimer: ReturnType<typeof setTimeout> | null = null;
  let playForReady = false; // the wait on pauseSeats has run out

  function deliver(m: Member, message: HostMessage): void {
    if (m.local) options.onLocalMessage(message);
    else if (m.connection !== null && m.connection.status === "open") m.connection.send(message);
  }

  // Taken only after a step has completed (and on lobby changes), so a resume never replays half a step.
  function save(): void {
    options.onSave?.({
      roomCode: options.roomCode,
      buildId,
      members: members.map((m) => ({ seat: m.seat, name: m.name, token: m.token })),
      run,
    });
  }

  // The one way game data reaches a player: their own views plus their own events.
  function sendRunUpdate(m: Member, events: RunEvent[]): void {
    if (run === null) return;
    deliver(m, { type: "runUpdate", view: getRunView(run, m.seat), events });
  }

  function sendBattleUpdate(m: Member, battle: BattleState, events: GameEvent[]): void {
    deliver(m, { type: "update", view: getView(battle, m.seat), events: getEventsView(events, m.seat) });
  }

  // What a player is sent after a step. A battle's last events come first, so the table plays them
  // before the run's new screen replaces it; a battle that just opened comes after the run update
  // that says so. A move inside a battle changes nothing the run shows, so it sends no run update.
  // `battle` is the table after the step (the finished one, when the step ended the battle).
  function sendStep(m: Member, events: RunEvent[], wasBattle: boolean, battle: BattleState | null): void {
    if (run === null) return;
    const split = splitRunEvents(events);
    if (wasBattle && battle !== null) sendBattleUpdate(m, battle, split.battle);
    if (!(wasBattle && run.battle !== null)) sendRunUpdate(m, split.run);
    if (!wasBattle && battle !== null) sendBattleUpdate(m, battle, split.battle);
  }

  // Everything the player needs to be where the run is now, with no events to replay.
  function sendCurrent(m: Member): void {
    sendRunUpdate(m, []);
    if (run?.battle) sendBattleUpdate(m, run.battle, []);
  }

  function sendToAll(events: RunEvent[], wasBattle: boolean, battle: BattleState | null): void {
    for (const m of members) sendStep(m, events, wasBattle, battle);
    sendStatus();
  }

  function presenceMessage(): HostMessage {
    return { type: "presence", players: members.map((m) => ({ seat: m.seat, name: m.name, away: !m.connected })) };
  }

  function clearPause(): void {
    if (pauseTimer !== null) clearTimeout(pauseTimer);
    pauseTimer = null;
    pauseSeats = [];
    playForReady = false;
  }

  // The seats that owe the run a choice right now.
  function owedSeats(): string[] {
    return run === null ? [] : [...new Set(getPendingRunChoices(run).map((p) => p.player))];
  }

  // The seat the host is playing for right now: one that owes a choice while the host's own owes none.
  function actingFor(): string | null {
    const owed = owedSeats();
    if (owed.includes(members.find((m) => m.local)!.seat)) return null;
    return owed.find((seat) => controlled.has(seat)) ?? null;
  }

  // Who is here, whether the run is waiting on someone who is away, and (for the host) who it is
  // playing for. Sent after every step and whenever someone leaves or returns. The run waits only
  // once everyone who is here has made their choices: until then they still have things to do.
  function sendStatus(): void {
    if (run === null) return;
    const owed = owedSeats()
      .map((seat) => members.find((m) => m.seat === seat))
      .filter((m): m is Member => m !== undefined);
    const present = owed.filter((m) => m.connected || controlled.has(m.seat));
    const waiting = present.length === 0 ? owed : [];
    const seats = waiting.map((m) => m.seat);
    if (seats.length === 0) clearPause();
    else if (seats.join(",") !== pauseSeats.join(",")) {
      clearPause();
      pauseSeats = seats;
      pauseTimer = setTimeout(() => {
        playForReady = true;
        sendStatus();
      }, PLAY_FOR_DELAY_MS);
    }
    const presence = presenceMessage();
    const acting = actingFor();
    for (const m of members) {
      deliver(m, presence);
      deliver(m, {
        type: "paused",
        waitingFor: waiting.length > 0 ? waiting.map((w) => w.name).join(" and ") : null,
        ...(m.local && waiting.length > 0 && playForReady ? { playFor: waiting[0].seat } : {}),
      });
      if (m.local) deliver(m, { type: "playing-for", seat: acting });
    }
  }

  function lobbyMessage(): HostMessage {
    return {
      type: "lobby",
      players: members.map((m) => ({ seat: m.seat, name: m.name, away: !m.connected })),
      seats: members.map((m) => m.seat),
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

  // Every choice, local or remote, ends up here. The seat is the one the choice is for; the engine
  // checks that the seat owes it. Errors go to `from` (the host's own player when it plays for a seat).
  function apply(seat: string, choice: RunChoice, from: Member): void {
    if (run === null) return deliver(from, { type: "error", message: "the run has not started" });
    const before = run;
    let result: RunStepResult;
    try {
      result = applyRunChoice(before, seat, choice);
    } catch (e) {
      return deliver(from, { type: "error", message: "choice rejected: " + (e instanceof Error ? e.message : "invalid") });
    }
    // The table to send: after the step, or the finished one when the step ended the battle.
    const wasBattle = before.battle !== null;
    const battle = wasBattle && choice.type === "battle" ? step(before.battle as BattleState, choice.choice).state : result.run.battle;
    run = result.run;
    save();
    sendToAll(result.events, wasBattle, battle);
  }

  // A choice in a battle. `m` is the seat it is for.
  function handleChoice(m: Member, choice: Choice, from: Member = m): void {
    if (run === null) return deliver(from, { type: "error", message: "the battle has not started" });
    const pending = run.battle ? getPendingChoice(run.battle) : null;
    if (pending === null) return deliver(from, { type: "error", message: "the battle is over" });
    if (pending.player !== m.seat) return deliver(from, { type: "error", message: "not your turn" });
    apply(m.seat, { type: "battle", choice }, from);
  }

  // Any other choice. A choice made for a decision that has already been settled is ignored: the
  // sender gets the run's new state anyway, and the choice must not land on the next decision.
  function handleRunChoice(m: Member, choice: RunChoice, at: unknown, from: Member = m): void {
    if (run === null) return deliver(from, { type: "error", message: "the run has not started" });
    if (at !== getRunWindow(run)) return;
    if (!choice || typeof choice !== "object" || choice.type === "battle") return deliver(from, { type: "error", message: "bad choice" });
    apply(m.seat, choice, from);
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
      } else if (run !== null) {
        return reply({ type: "refused", reason: "The game has already started." });
      } else if (members.length >= MAX_SEATS) {
        return reply({ type: "refused", reason: "The room is full." });
      } else {
        me = { seat: "p" + (members.length + 1), name, token, local: false, connection, connected: true };
        members.push(me);
      }
      reply({ type: "welcome", seat: me.seat, token });
      if (run === null) sendLobby();
      else {
        // Where the run stands straight away, with no events to replay; then everyone hears who is here.
        reply(presenceMessage());
        sendCurrent(me);
        sendStatus();
      }
    } else if (msg.type === "choice") {
      if (!known) return reply({ type: "error", message: "say hello first" });
      handleChoice(known, msg.choice as Choice);
    } else if (msg.type === "runChoice") {
      if (!known) return reply({ type: "error", message: "say hello first" });
      handleRunChoice(known, msg.choice as RunChoice, msg.window);
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
      if (run === null) {
        // Not started: free the seat.
        members.splice(members.indexOf(m), 1);
        renumber();
        sendLobby();
      } else sendStatus();
    });
  });

  return {
    start(seed, allowFewer = false) {
      if (run !== null) throw new Error("already started");
      if (members.length < MIN_SEATS && !allowFewer) throw new Error("need " + MIN_SEATS + " players");
      const away = members.find((m) => !m.connected);
      if (away) throw new Error("waiting for " + away.name + " to reconnect");
      const result = createRunWithEvents({ players: members.map((m) => m.seat), seed, content: options.content });
      run = result.run;
      save();
      sendStatus(); // who is here, so the screens know the names before the first view
      for (const m of members) sendStep(m, result.events, false, run.battle);
    },
    moveSeat(seat, direction) {
      if (run !== null) return;
      const i = members.findIndex((x) => x.seat === seat);
      const j = i + direction;
      if (i < 0 || j < 0 || j >= members.length) return;
      [members[i], members[j]] = [members[j], members[i]];
      renumber();
      sendLobby();
    },
    kick(seat) {
      if (run !== null) return;
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
    submitLocal(choice) {
      const local = members.find((x) => x.local)!;
      const pending = run?.battle ? getPendingChoice(run.battle) : null;
      const target = pending !== null && controlled.has(pending.player) ? members.find((x) => x.seat === pending.player)! : local;
      handleChoice(target, choice, local);
    },
    submitLocalRun(choice, at, seat) {
      const local = members.find((x) => x.local)!;
      const target = seat !== undefined && controlled.has(seat) ? members.find((x) => x.seat === seat) ?? local : local;
      handleRunChoice(target, choice, at, local);
    },
    playFor(seat) {
      if (!playForReady || !pauseSeats.includes(seat)) return;
      controlled.add(seat);
      sendStatus();
    },
    announce() {
      const local = members.find((x) => x.local)!;
      if (run === null) return deliver(local, lobbyMessage());
      deliver(local, presenceMessage()); // the names first
      sendCurrent(local);
      sendStatus();
    },
    close() {
      clearPause();
      options.onSave?.(null);
      transport.close();
    },
    backToLobby() {
      if (run === null) return;
      run = null;
      controlled.clear();
      clearPause();
      sendLobby();
    },
    getState() {
      return run?.battle ?? null;
    },
  };
}
