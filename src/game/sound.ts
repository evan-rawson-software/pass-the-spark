import soundJson from "../../data/sound.json";
import type { RunEvent } from "../engine/run";
import { getPlaybackSpeed } from "./playbackSpeed";

// Sound effects (#137), played from this browser's own events; nothing goes on the network. The cue
// table (files, volumes, gaps) is data/sound.json. The audio files are loaded by GameMenuScene; a cue
// whose file is missing is silently skipped. Playback speed never slows a sound: it only makes the
// gap between repeats of a cue longer, so fast playback plays fewer sounds.

// A cue plays one or more layers together. `file` is shorthand for a single layer. A layer's volume
// multiplies the cue's, and its cents shift its pitch. `rises` (plain pitch climb) and `scale` (climb a
// musical scale, see D.scales) both read the step passed to playSound. `fastFallback` names a shorter
// cue to play instead when the playback speed is at least `atSpeed`.
interface Layer { file: string; volume?: number; cents?: number }
interface Cue {
  file?: string; layers?: Layer[]; volume: number; minGapMs: number; rises?: boolean; baseCents?: number;
  scale?: string; maxStep?: number; randomStep?: boolean; fastFallback?: { cue: string; atSpeed: number };
}
interface LimiterData { threshold: number; knee: number; ratio: number; attack: number; release: number }
const D = soundJson as unknown as {
  tickPitch: { stepCents: number; maxSteps: number };
  scales: Record<string, number[]>;
  limiter: LimiterData;
  cues: Record<string, Cue>;
};

const layersOf = (c: Cue): Layer[] => c.layers ?? (c.file ? [{ file: c.file }] : []);
export const SOUND_FILES = Array.from(new Set(Object.values(D.cues).flatMap((c) => layersOf(c).map((l) => l.file))));
export const SOUND_CUES = Object.keys(D.cues);
export const soundKey = (file: string): string => `audio/${file}`;

// The slice of Phaser's sound manager used here (GameMenuScene supplies it).
export interface SoundHandle { stop(): void }
export interface SoundOut {
  play(key: string, config: { volume: number; detune: number }): SoundHandle | null;
  has(key: string): boolean;
}
let out: SoundOut | null = null;
export function setSoundOut(o: SoundOut): void {
  out = o;
}

// The structural slice of Phaser's WebAudio sound manager used by phaserSoundOut.
interface PhaserSound { play(): unknown; stop(): unknown; once(event: string, fn: () => void): unknown; destroy(): unknown }
interface PhaserManager {
  add(key: string, config: { volume: number; detune: number }): PhaserSound;
  context?: AudioContext;
  masterVolumeNode?: AudioNode;
}

// Builds the SoundOut for Phaser's sound manager and, when it is WebAudio, puts a limiter
// (DynamicsCompressorNode, values in data/sound.json) between the master volume and the speakers so
// stacked layers cannot clip. Without WebAudio there is no limiter and the cues play as they are.
export function phaserSoundOut(manager: PhaserManager, cache: { exists(key: string): boolean }): SoundOut {
  const ctx = manager.context;
  const master = manager.masterVolumeNode;
  if (ctx && master && typeof ctx.createDynamicsCompressor === "function") {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = D.limiter.threshold;
    comp.knee.value = D.limiter.knee;
    comp.ratio.value = D.limiter.ratio;
    comp.attack.value = D.limiter.attack;
    comp.release.value = D.limiter.release;
    master.disconnect();
    master.connect(comp);
    comp.connect(ctx.destination);
  }
  return {
    has: (key) => cache.exists(key),
    play: (key, config) => {
      try {
        const s = manager.add(key, config);
        let done = false;
        s.once("complete", () => {
          done = true;
          s.destroy();
        });
        s.play();
        return { stop: () => { if (!done) { done = true; s.stop(); s.destroy(); } } };
      } catch {
        return null;
      }
    },
  };
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
const playing = new Map<string, SoundHandle[]>();

let hushed = false;
// A skipped cascade plays no sound for what it jumps over.
export function setSoundHushed(value: boolean): void {
  hushed = value;
}

// Stops what a cue is still playing (the slam stops combo:charge).
export function stopSound(cue: string): void {
  for (const h of playing.get(cue) ?? []) h.stop();
  playing.delete(cue);
}

// Cents for a 1-based step: a plain climb (`rises`), or a note on the cue's scale (the scale repeats an
// octave up; steps past maxStep stay on the top note). A cue with randomStep picks its own note.
function stepCents(c: Cue, step: number): number {
  const n = Math.max(step - 1, 0);
  const scale = c.scale ? D.scales[c.scale] : undefined;
  if (scale && scale.length > 0) {
    const max = c.maxStep ?? scale.length - 1;
    const i = c.randomStep ? Math.floor(Math.random() * (max + 1)) : Math.min(n, max);
    return (scale[i % scale.length] + 12 * Math.floor(i / scale.length)) * 100;
  }
  return c.rises ? Math.min(n, D.tickPitch.maxSteps) * D.tickPitch.stepCents : 0;
}

// Play a cue. `step` (1 = first) raises the pitch of rising and scale cues with the cascade step or heat;
// `gain` (0..1) scales the volume of every layer. Gaps between repeats of a cue are multiplied by the
// playback speed. At or above a cue's fastFallback speed the named shorter cue plays instead.
export function playSound(cue: string, step = 1, gain = 1, allowFallback = true): void {
  const c = D.cues[cue];
  if (!c || !out || settings.muted || hushed) return;
  if (allowFallback && c.fastFallback && getPlaybackSpeed() >= c.fastFallback.atSpeed) {
    playSound(c.fastFallback.cue, step, gain, false);
    return;
  }
  const base = c.volume * gain * settings.master * settings.effects;
  if (base <= 0) return;
  const layers = layersOf(c).filter((l) => (l.volume ?? 1) > 0 && out!.has(soundKey(l.file)));
  if (layers.length === 0) return;
  const now = performance.now();
  if (now - (lastPlayed.get(cue) ?? -Infinity) < c.minGapMs * getPlaybackSpeed()) return;
  lastPlayed.set(cue, now);
  const pitch = (c.baseCents ?? 0) + stepCents(c, step);
  const handles = (playing.get(cue) ?? []).slice(-7);
  for (const l of layers) {
    const h = out.play(soundKey(l.file), { volume: base * (l.volume ?? 1), detune: pitch + (l.cents ?? 0) });
    if (h) handles.push(h);
  }
  playing.set(cue, handles);
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
