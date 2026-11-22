// The host: holds the RunState and is the only place the engine runs.
// Clients send choices; the host checks each one, applies it, and sends every player
// their own views and events. The full RunState and BattleState never leave this file.

import { step } from "../engine/battle";
import type { BattleState, Choice } from "../engine/battle";
import type { Content } from "../engine/content";
import { getEventsView } from "../engine/events";
import type { GameEvent } from "../engine/events";
import { applyRunChoice, createRunWithEvents, getPendingRunChoices, getRunWindow, splitRunEvents } from "../engine/run";
import type { RunChoice, RunEvent, RunState, RunStepResult } from "../engine/run";
import { getRunView, getView } from "../engine/view";
import { allUnlocks, runExperience } from "../engine/progression";
import { REFUSED_BUILD, REFUSED_KICKED } from "./protocol";
import type { ClientMessage, HostMessage, PingTarget } from "./protocol";
import { fixLook, isLook } from "./look";
import type { Look } from "./look";
import { hostPeerId } from "./room";
import type { SavedRoom } from "./room";
import type { Connection, Transport } from "./transport";

export const MAX_SEATS = 4;
export const MIN_SEATS = 2;
export const MAX_NAME_LENGTH = 24;
// How long the game waits for an away player before the host may play for them.
export const PLAY_FOR_DELAY_MS = 60_000;
// The least time between two pings from one player.
export const PING_INTERVAL_MS = 1000;

export interface HostOptions {
  transport: Transport;
  roomCode: string;
  buildId: string;
  hostName: string;
  content: Content; // everything the run reads from data
  unlocks: () => string[]; // the host's own player's unlocks, read when the run starts
  look?: Look; // the host's own player's saved look; a missing or invalid one is fixed
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
  look: Look; // always valid, and its colour is never another member's
  unlocks: string[]; // what a joining player said they have unlocked, cleaned; used when the run starts
  lastPing: number; // when this player last pinged (for the rate limit); pings are never saved
}

export interface Host {
  // Start the run with whoever has joined. The seed comes from the caller.
  // Needs MIN_SEATS players unless allowFewer is set (debug panel).
  start(seed: number, allowFewer?: boolean): void;
  // Lobby actions. They are methods on the host, not messages, so a client cannot trigger them.
  // They do nothing once the run has started.
  moveSeat(seat: string, direction: -1 | 1): void;
  kick(seat: string): void;
  // The host's own player changes their look. Ignored once the run has started, or when the colour is taken.
  setLook(look: Look): void;
  // The host's own player submits a battle choice, checked like everyone else's. It may name the
  // host's own seat or a seat the host is playing for.
  submitLocal(choice: Choice): void;
  // The host's own player submits any other run choice. `at` is RunView.window of the screen it
  // was made on; seat is the seat it is for (the host's own, or one it is playing for).
  submitLocalRun(choice: RunChoice, at: string, seat?: string): void;
  // After the wait for an away player has run out: take over that seat until the player returns.
  playFor(seat: string): void;
  // The host's own player pings a domino (checked and relayed like anyone else's).
  submitLocalPing(target: PingTarget): void;
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
  const members: Member[] = [];
  // Seats in order: a saved look is kept unless it is missing, unreadable or clashes with an earlier seat.
  for (const x of saved?.members ?? [{ seat: "p1", name: options.hostName, token: null }]) {
    const look = fixLook((x as { look?: Look }).look ?? (x.token === null ? options.look : undefined), members.map((m) => m.look.colour));
    members.push({
      seat: x.seat,
      name: x.name,
      token: x.token,
      local: x.token === null, // only the host's own seat has no token
      connection: null,
      connected: x.token === null,
      look,
      unlocks: [],
      lastPing: 0,
    });
  }
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
      members: members.map((m) => ({ seat: m.seat, name: m.name, token: m.token, look: m.look })),
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
    return { type: "presence", players: members.map((m) => ({ seat: m.seat, name: m.name, away: !m.connected, look: m.look })) };
  }

  function clearPause(): void {
    if (pauseTimer !== null) clearTimeout(pauseTimer);
    pauseTimer = null;
    pauseSeats = [];
    playForReady = false;
  }

  // The seats that owe the run a choice right now. In a battle's build the table owes nothing but
  // Ready, so the seats that are not Ready yet.
  function owedSeats(): string[] {
    if (run === null) return [];
    if (run.battle !== null && run.phase === "battle") return run.battle.players.filter((p) => !p.ready).map((p) => p.id);
    return [...new Set(getPendingRunChoices(run).map((p) => p.player))];
  }

  // The seat the host is playing for right now: one that owes a choice while the host's own owes none.
  // In a battle every seat can act at any time, so it is the first seat the host has taken over.
  function actingFor(): string | null {
    if (run?.battle) return members.find((m) => !m.local && controlled.has(m.seat))?.seat ?? null;
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
    // A seat the host has taken over is never waited on again: when it owes something, the host is on it.
    const present = owed.filter((m) => m.connected || controlled.has(m.seat));
    const waiting = present.length === 0 ? owed : [];
    const seats = waiting.map((m) => m.seat);
    if (seats.length === 0) clearPause();
    else if (seats.join(",") !== pauseSeats.join(",")) {
      clearPause();
      pauseSeats = seats;
      pauseTimer = setTimeout(() => {
        playForReady = true;
        if (run?.battle && run.phase === "battle") readyForAway(seats);
        else sendStatus();
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

  // The wait on away players in a build has run out: they count as Ready. The host takes over their
  // seats (it can place, take back and toggle Ready for them) until the players return.
  function readyForAway(seats: string[]): void {
    const local = members.find((m) => m.local)!;
    for (const seat of seats) {
      controlled.add(seat);
      const player = run?.battle?.players.find((p) => p.id === seat);
      if (player !== undefined && !player.ready) apply(seat, { type: "battle", choice: { type: "ready", player: seat, ready: true } }, local);
    }
    if (run !== null) sendStatus();
  }

  // A new build has begun (a battle opened or a round turned over): every seat the host has taken over
  // counts as Ready straight away. The host can toggle it off to place or take back, and on again.
  function readyTakenOver(): void {
    const local = members.find((m) => m.local)!;
    for (const seat of controlled) {
      const player = run?.battle?.players.find((p) => p.id === seat);
      if (player !== undefined && !player.ready) apply(seat, { type: "battle", choice: { type: "ready", player: seat, ready: true } }, local);
    }
  }

  function lobbyMessage(): HostMessage {
    return {
      type: "lobby",
      // level is display only: one unlock per level, so the (cleaned) unlocks a player sent say which level they are
      players: members.map((m) => ({ seat: m.seat, name: m.name, level: (m.local ? cleanUnlocks(options.unlocks()) : m.unlocks).length, away: !m.connected, look: m.look })),
      seats: members.map((m) => m.seat),
    };
  }

  function sendLobby(): void {
    const message = lobbyMessage();
    for (const m of members) deliver(m, message);
    save();
  }

  // A look change from `m`, in the lobby only (a lobby message during a run would send everyone back
  // to the lobby). A look that is not valid, or whose colour another player has, is ignored; the
  // player is sent the lobby again so their screen shows the truth.
  function handleLook(m: Member, raw: unknown): void {
    if (run !== null) return;
    if (!isLook(raw) || members.some((x) => x !== m && x.look.colour === raw.colour)) return deliver(m, lobbyMessage());
    m.look = { colour: raw.colour, hat: raw.hat, robe: raw.robe };
    sendLobby();
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

  // Only known unlock ids, each once: never trust a client's list as it is.
  function cleanUnlocks(raw: unknown): string[] {
    return Array.isArray(raw) ? allUnlocks(options.content.progression).filter((id) => raw.includes(id)) : [];
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
    if (before.result === null && run.result !== null) {
      // The run just ended: everyone in the room is given its experience; an away player gets nothing.
      const message: HostMessage = { type: "experience", runId: options.roomCode + "-" + Date.now(), gained: runExperience(run) };
      for (const m of members) if (m.connected) deliver(m, message);
    }
    if (run.battle !== null && run.phase === "battle" && (before.battle === null || before.battle.round !== run.battle.round)) readyTakenOver();
  }

  // A choice in a battle's build. `m` is the seat it is for: the choice must name that seat. Choices
  // are applied one at a time as they arrive; one that is no longer legal is refused to `from` only.
  function handleChoice(m: Member, choice: Choice, from: Member = m): void {
    if (run === null || run.battle === null) return deliver(from, { type: "error", message: "there is no battle" });
    if (!choice || typeof choice !== "object" || choice.player !== m.seat) return deliver(from, { type: "error", message: "not your seat" });
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

  // True when the target names something every player can see right now: a seat's hand slot, a board
  // node, or an open end. Anything else (a bad shape, a capped end) is dropped.
  function visibleTarget(target: unknown): target is PingTarget {
    const battle = run?.battle;
    if (!battle || battle.phase === "over" || !target || typeof target !== "object") return false;
    const t = target as { zone?: unknown; seat?: unknown; index?: unknown };
    const i = t.index;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0) return false;
    if (t.zone === "hand") {
      const p = battle.players.find((x) => x.id === t.seat);
      return p !== undefined && i < p.hand.length;
    }
    if (t.zone === "chain") return battle.board.nodes.some((n) => n.id === i);
    if (t.zone === "end") return battle.board.ends.some((e) => e.id === i) && !battle.board.nodes.some((n) => n.end === i);
    return false;
  }

  // A ping from `m`'s own connection: the name and seat are the member's, never the message's.
  // At most one per second per player; rebuilt from known fields so nothing else rides along.
  function handlePing(m: Member, target: unknown): void {
    if (Date.now() - m.lastPing < PING_INTERVAL_MS || !visibleTarget(target)) return;
    m.lastPing = Date.now();
    const clean: PingTarget =
      target.zone === "hand" ? { zone: "hand", seat: target.seat, index: target.index } : { zone: target.zone, index: target.index };
    const message: HostMessage = { type: "ping", seat: m.seat, name: m.name, target: clean };
    for (const x of members) deliver(x, message);
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
        if (run === null || run.phase === "over") me.unlocks = cleanUnlocks(msg.unlocks); // a run in progress keeps the unlocks it started with
      } else if (run !== null) {
        return reply({ type: "refused", reason: "The game has already started." });
      } else if (members.length >= MAX_SEATS) {
        return reply({ type: "refused", reason: "The room is full." });
      } else {
        me = {
          seat: "p" + (members.length + 1), name, token, local: false, connection, connected: true, lastPing: 0,
          look: fixLook(msg.look, members.map((x) => x.look.colour)), // a joiner never clashes: the later joiner gets the first free colour
          unlocks: cleanUnlocks(msg.unlocks),
        };
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
    } else if (msg.type === "unlocks") {
      if (!known) return reply({ type: "error", message: "say hello first" });
      if (run === null || run.phase === "over") known.unlocks = cleanUnlocks(msg.unlocks); // the run is over: they count for the next one
      if (run === null) sendLobby(); // already back in the lobby: show the new level (while the run screen is up, a lobby message would send everyone back)
    } else if (msg.type === "look") {
      if (!known) return reply({ type: "error", message: "say hello first" });
      handleLook(known, msg.look);
    } else if (msg.type === "ping") {
      if (!known) return reply({ type: "error", message: "say hello first" });
      handlePing(known, msg.target);
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
      const result = createRunWithEvents({
        players: members.map((m) => m.seat),
        seed,
        content: options.content,
        unlocks: Object.fromEntries(members.map((m) => [m.seat, m.local ? cleanUnlocks(options.unlocks()) : m.unlocks])),
      });
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
    setLook(look) {
      handleLook(members.find((x) => x.local)!, look);
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
      // The host's own seat, or one it has taken over: the choice names the seat it is for.
      const target = members.find((x) => x.seat === choice?.player);
      if (target === undefined || !(target.local || controlled.has(target.seat))) return deliver(local, { type: "error", message: "not your seat" });
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
    submitLocalPing(target) {
      handlePing(members.find((x) => x.local)!, target);
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
      save();
      sendLobby();
    },
    getState() {
      return run?.battle ?? null;
    },
  };
}
