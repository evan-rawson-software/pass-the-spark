import soundJson from "../../data/sound.json";
import type { RunEvent } from "../engine/run";
import { getPlaybackSpeed } from "./playbackSpeed";

// Sound effects (#137), played from this browser's own events; nothing goes on the network. The cue
// table (files, volumes, gaps) is data/sound.json. The audio files are loaded by SoundScene; a cue
// whose file is missing is silently skipped. Playback speed never slows a sound: it only makes the
// gap between repeats of a cue longer, so fast playback plays fewer sounds.

interface Cue { file: string; volume: number; minGapMs: number; rises?: boolean }
const D = soundJson as unknown as { tickPitch: { stepCents: number; maxSteps: number }; cues: Record<string, Cue> };

export const SOUND_FILES = Array.from(new Set(Object.values(D.cues).map((c) => c.file)));
export const soundKey = (file: string): string => `audio/${file}`;

// The slice of Phaser's sound manager used here (SoundScene supplies it).
export interface SoundOut {
  play(key: string, config: { volume: number; detune: number }): unknown;
  has(key: string): boolean;
}
let out: SoundOut | null = null;
export function setSoundOut(o: SoundOut): void {
  out = o;
}

const KEY = "pass-the-spark.sound";
export interface SoundSettings { master: number; effects: number; muted: boolean }
const settings: SoundSettings = { master: 1, effects: 1, muted: false };
try {
  const s = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<SoundSettings> | null;
  if (s) {
    if (typeof s.master === "number") settings.master = Math.min(1, Math.max(0, s.master));
    if (typeof s.effects === "number") settings.effects = Math.min(1, Math.max(0, s.effects));
    if (typeof s.muted === "boolean") settings.muted = s.muted;
  }
} catch {
  // storage unavailable or unreadable: defaults
}

export function getSoundSettings(): SoundSettings {
  return settings;
}

export function setSoundSettings(change: Partial<SoundSettings>): void {
  Object.assign(settings, change);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable: the setting just lasts until reload
  }
}

const lastPlayed = new Map<string, number>();

// Play a cue. `links` raises the pitch of rising cues (tick, topple) along the chain.
export function playSound(cue: string, links = 1): void {
  const c = D.cues[cue];
  if (!c || !out || settings.muted) return;
  const volume = c.volume * settings.master * settings.effects;
  const key = soundKey(c.file);
  if (volume <= 0 || !out.has(key)) return;
  const now = performance.now();
  if (now - (lastPlayed.get(cue) ?? -Infinity) < c.minGapMs * getPlaybackSpeed()) return;
  lastPlayed.set(cue, now);
  const steps = c.rises ? Math.min(Math.max(links - 1, 0), D.tickPitch.maxSteps) : 0;
  out.play(key, { volume, detune: steps * D.tickPitch.stepCents });
}

// Sounds for what the engine says happened in a run step (rest, a purchase or removal, coins won).
// Played only from accepted outcomes, so a refused choice is silent. Single player calls this with
// the events applyRunChoice returns; online, relay.deliver calls it with each run update's events.
export function playRunEventSounds(events: RunEvent[]): void {
  for (const e of events) {
    if (e.type === "rest") playSound("rest");
    else if (e.type === "bought" || e.type === "charmBought" || e.type === "removed") playSound("buy");
    else if (e.type === "coins" && e.amount > 0) playSound("coins");
  }
}
