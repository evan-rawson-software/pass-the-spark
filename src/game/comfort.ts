import { comfortData } from "./presentation";

// Comfort settings (F7): screen shake and reduced flashing. Remembered in localStorage, so they are
// per player online and one set per machine in single player. Effects call shakeEnabled() and
// reducedFlashing() before they shake the camera or flash the screen.

const KEY = "pass-the-spark.comfort";

let shake = comfortData.shakeDefault;
let reduced = comfortData.reducedFlashingDefault;
try {
  const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as { shake?: unknown; reducedFlashing?: unknown } | null;
  if (typeof saved?.shake === "boolean") shake = saved.shake;
  if (typeof saved?.reducedFlashing === "boolean") reduced = saved.reducedFlashing;
} catch {
  // storage unavailable: keep the defaults
}

export function shakeEnabled(): boolean {
  return shake;
}

export function reducedFlashing(): boolean {
  return reduced;
}

export function setComfort(values: { shake?: boolean; reducedFlashing?: boolean }): void {
  if (values.shake !== undefined) shake = values.shake;
  if (values.reducedFlashing !== undefined) reduced = values.reducedFlashing;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ shake, reducedFlashing: reduced }));
  } catch {
    // storage unavailable: the settings last until reload
  }
}
