// The playback-speed setting: 0.5x, 1x, 2x or 4x. Every delay (and, later, every tween) on the
// table is divided by it, so animations (#25) should use scaleTime for their durations.
// It is remembered in localStorage; if storage is blocked it just stays at 1x.

export const SPEEDS = [0.5, 1, 2, 4];
const KEY = "pass-the-spark.playbackSpeed";

let speed = 1;
try {
  const saved = Number(window.localStorage.getItem(KEY));
  if (SPEEDS.includes(saved)) speed = saved;
} catch {
  // storage unavailable: keep 1x
}

export function getPlaybackSpeed(): number {
  return speed;
}

export function setPlaybackSpeed(value: number): void {
  speed = value;
  try {
    window.localStorage.setItem(KEY, String(value));
  } catch {
    // storage unavailable: the setting just lasts until reload
  }
}

// A duration in milliseconds at 1x, scaled to the current speed.
export function scaleTime(ms: number): number {
  return ms / speed;
}
