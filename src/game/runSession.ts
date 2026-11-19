import type Phaser from "phaser";
import { applyRunChoice, createRun, getPendingRunChoices } from "../engine/run";
import type { RunChoice, RunPendingChoice, RunState } from "../engine/run";
import { content } from "./devBattle";

// The single-player run (#50). The game layer keeps the RunState here and sends every choice to
// applyRunChoice; the run's phase says which screen is open. No rules live here.

interface RunSession {
  run: RunState;
  seed: number;
  names: string[];
}

let session: RunSession | null = null;

export function startSingleRun(names: string[], seed: number): RunState {
  session = { run: createRun({ players: names, seed, content }), seed, names };
  return session.run;
}

export function currentRun(): RunState {
  if (!session) throw new Error("no run in progress");
  return session.run;
}

export function runSeed(): number {
  return session?.seed ?? 0;
}

export function runNames(): string[] {
  return session?.names ?? [];
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
    case "over": return "runEnd";
  }
}

// Opens the screen for the run's current phase.
export function openRunScreen(scene: Phaser.Scene): void {
  scene.scene.start(sceneFor(currentRun()), { run: true });
}

// Single player: the next choice somebody owes, and so whose turn it is at the screen.
export function nextPending(run: RunState): RunPendingChoice | null {
  return getPendingRunChoices(run)[0] ?? null;
}

// Sends a choice to the run engine, then opens whatever screen the new phase calls for.
export function submitRunChoice(scene: Phaser.Scene, player: string, choice: RunChoice): void {
  setRun(applyRunChoice(currentRun(), player, choice).run);
  openRunScreen(scene);
}
