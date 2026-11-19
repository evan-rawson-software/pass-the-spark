import type Phaser from "phaser";
import { runExperience } from "../engine/progression";
import { applyRunChoice, createRun, getPendingRunChoices } from "../engine/run";
import type { RunChoice, RunEvent, RunPendingChoice, RunState } from "../engine/run";
import type { RunView } from "../engine/view";
import type { Client } from "../net/client";
import type { Host } from "../net/host";
import type { HostMessage } from "../net/protocol";
import { content } from "./devBattle";
import { deckViewerState } from "./deckViewer";
import { watchLink } from "./linkBanner";
import { awardExperience, clearAward, loadProfile } from "./profile";
import { relay } from "./relay";

// The run the screens draw. Single player: the game layer keeps the RunState here and sends every
// choice to applyRunChoice; the run's phase says which screen is open (#50). Online (#49): the host
// holds the real RunState; what is kept here is a stand-in built from the RunView the host last sent
// (plus the data every player already has), and choices go to the host instead. No rules live here.

// Online: where this machine's run comes from and goes to.
export interface OnlineRun {
  host?: Host; // set on the host's machine
  client?: Client; // set on a joining player's machine
  seat: string; // this player's seat
  roomCode: string;
}

interface RunSession {
  run: RunState;
  seed: number;
  names: string[];
  online: OnlineRun | null;
  runId: string; // single player: which run this is
  window: string; // online: the decision the run was waiting on in the last view (RunView.window)
}

let session: RunSession | null = null;

export function startSingleRun(names: string[], seed: number): RunState {
  // One profile covers every seat. runId says which run this is, so its experience is added once.
  clearAward();
  const unlocks = Object.fromEntries(names.map((n) => [n, loadProfile().unlocks]));
  session = { run: createRun({ players: names, seed, content, unlocks }), seed, names, online: null, window: "", runId: `${seed}-${Date.now()}` };
  return session.run;
}

// The run as the stand-in screens draw: the view, plus the content from data. rng and battle are
// not known here (a battle has its own views); nothing on the run screens reads them.
function standIn(view: RunView): RunState {
  const { window: at, ...rest } = view;
  void at;
  return { ...rest, content, rng: 0, battle: null, eventsSeen: [] };
}

// Online: a run has started (or the page reopened in the middle of one) and this is its first view.
export function startOnlineRun(online: OnlineRun, view: RunView): void {
  clearAward();
  session = { run: standIn(view), seed: 0, names: [], online, window: view.window, runId: "" };
  relay.onRun = (m) => {
    if (!session?.online) return;
    session.run = standIn(m.view);
    session.window = m.view.window;
  };
}

// Online: the run is over and the room is back in its lobby.
export function leaveOnlineRun(): void {
  if (session?.online) session = null;
  relay.onRun = null;
}

export function currentRun(): RunState {
  if (!session) throw new Error("no run in progress");
  return session.run;
}

// Single player: the run is over; its experience goes to the profile (once, however often the screen opens).
export function awardSingleRun(): void {
  if (session && !session.online) awardExperience(session.runId, runExperience(session.run));
}

export function runSeed(): number {
  return session?.seed ?? 0;
}

export function runNames(): string[] {
  return session?.names ?? [];
}

export function isOnlineRun(): boolean {
  return session?.online != null;
}

export function onlineRun(): OnlineRun | null {
  return session?.online ?? null;
}

// A seat's display name. Online it is the player's name (the seats are p1, p2, ...); single player
// the seat id is the name.
export function seatName(seat: string): string {
  if (!isOnlineRun()) return seat;
  return relay.roster?.players.find((p) => p.seat === seat)?.name ?? relay.lobby?.players.find((p) => p.seat === seat)?.name ?? seat;
}

// Seat -> name for everyone in the run.
export function seatNames(): Record<string, string> {
  const names: Record<string, string> = {};
  for (const id of currentRun().players) names[id] = seatName(id);
  return names;
}

// Replaces the run (the combat scene and the debug panel hand back a new run state).
export function setRun(run: RunState): void {
  if (!session) throw new Error("no run in progress");
  session.run = run;
}

// The scene that shows the run's current phase.
export function sceneFor(run: RunState): string {
  switch (run.phase) {
    case "vote": return "map";
    case "battle": return "combat";
    case "reward": return "reward";
    case "rest": return "rest";
    case "trader": return "trader";
    case "event": return "event";
    case "act": return "actStart";
    case "over": return "runEnd";
  }
}

// Online: the seat this screen makes choices for. Normally the player's own; once the host is
// playing for an away player, and has no choice of its own to make, that seat.
export function actingSeat(run: RunState): string | null {
  const online = session?.online;
  if (!online) return null;
  const owes = (seat: string) => getPendingRunChoices(run).some((p) => p.player === seat);
  if (!owes(online.seat) && relay.playingFor !== null && owes(relay.playingFor)) return relay.playingFor;
  return online.seat;
}

// Opens the screen for the run's current phase. Online it always carries the seat the screen is for.
export function openRunScreen(scene: Phaser.Scene): void {
  const run = currentRun();
  const online = session?.online;
  if (online && run.phase === "battle") {
    // The table opens from the battle's first view, which follows the run update that opened it.
    if (relay.battle === null) return;
    scene.scene.start("combat", {
      run: true,
      online: { host: online.host, client: online.client, seat: online.seat, view: relay.battle.view, names: seatNames(), roomCode: online.roomCode },
    });
    return;
  }
  scene.scene.start(sceneFor(run), { run: true, localSeat: actingSeat(run) ?? undefined });
}

// Single player: the next choice somebody owes, and so whose turn it is at the screen.
export function nextPending(run: RunState): RunPendingChoice | null {
  return getPendingRunChoices(run)[0] ?? null;
}

// The choice this screen can make now: in single player the next one anybody owes, online the
// one the acting seat owes (none once it has chosen).
export function myPending(run: RunState): RunPendingChoice | null {
  const seat = actingSeat(run);
  if (seat === null) return nextPending(run);
  return getPendingRunChoices(run).find((p) => p.player === seat) ?? null;
}

// Sends a choice to the run engine, then opens whatever screen the new phase calls for.
// Online the choice goes to the host and the screen changes when the host's answer arrives.
export function submitRunChoice(scene: Phaser.Scene, player: string, choice: RunChoice): void {
  const online = session?.online;
  if (online) {
    if (online.host) online.host.submitLocalRun(choice, session!.window, player);
    else online.client?.sendRunChoice(choice, session!.window);
    return;
  }
  setRun(applyRunChoice(currentRun(), player, choice).run);
  openRunScreen(scene);
}

// Online: keeps a run screen in step with the host. `key` is the screen's own scene key. When the
// run moves to another phase the screen for it opens; otherwise `redraw` draws the screen again,
// in place (a scene restart is only carried out at the next frame, and by then a later update
// may have started something that the restart would wipe). `onUpdate` sees a run update's
// events first and returns true when the screen will move on by itself; `busy` holds everything
// back while it is true (the screen opens the next one itself when it is done).
export function watchRun(
  scene: Phaser.Scene,
  key: string,
  opts: { redraw: () => void; onUpdate?: (events: RunEvent[]) => boolean; busy?: () => boolean },
): void {
  const online = session?.online;
  if (!online) return;
  deckViewerState.open = false;
  deckViewerState.onClose = null;
  watchLink(scene, online.client);
  const redraw = () => {
    if (deckViewerState.open) {
      deckViewerState.onClose = redraw; // the deck viewer is on top: redraw once it is closed
      return;
    }
    opts.redraw();
  };
  // Status messages come after every step; only redraw when one of them says something new.
  const status = () => JSON.stringify([relay.roster, relay.paused, relay.playingFor]);
  let shown = status();
  const handler = (m: HostMessage) => {
    if (opts.busy?.()) return;
    if (m.type === "runUpdate") {
      if (opts.onUpdate?.(m.events)) return;
      shown = status();
      if (sceneFor(currentRun()) !== key) openRunScreen(scene);
      else redraw();
    } else if (m.type === "update") {
      // A battle has opened: its first view is here.
      if (currentRun().phase === "battle") openRunScreen(scene);
    } else if (m.type === "paused" || m.type === "presence" || m.type === "playing-for") {
      if (status() === shown) return;
      shown = status();
      redraw();
    }
  };
  relay.handler = handler;
  scene.events.once("shutdown", () => {
    if (relay.handler === handler) relay.handler = null;
  });
}
