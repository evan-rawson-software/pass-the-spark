import { allUnlocks, applyExperience, NEW_PROFILE } from "../engine/progression";
import type { Profile } from "../engine/progression";
import { isLook, randomLook } from "../net/look";
import type { Look } from "../net/look";
import { content } from "./devBattle";

// This browser's profile (#131): experience and unlocks in localStorage. A missing or unreadable
// one starts fresh. lastRun is the run the experience was last added for, so a run pays out once.

const KEY = "pass-the-spark.profile";
const data = content.progression;

// The comfort settings (menu: screen shake, reduced flashing) live in the profile too.
export interface Comfort {
  shake: boolean;
  reducedFlashing: boolean;
}

interface StoredProfile extends Profile {
  lastRun?: string;
  comfort?: Comfort;
  look?: Look; // the wizard look used online (A5)
  seatLooks?: (Look | null)[]; // single player: the look of seat 1, seat 2, ...
}

export function loadProfile(): StoredProfile {
  try {
    const p = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<StoredProfile> | null;
    if (!p || typeof p.experience !== "number" || !Number.isFinite(p.experience) || p.experience < 0 || !Array.isArray(p.unlocks)) return { ...NEW_PROFILE, unlocks: [] };
    const unlocks = allUnlocks(data).filter((id) => p.unlocks!.includes(id));
    const c = p.comfort;
    const comfort = c && typeof c.shake === "boolean" && typeof c.reducedFlashing === "boolean" ? { comfort: { shake: c.shake, reducedFlashing: c.reducedFlashing } } : {};
    const look = isLook(p.look) ? { look: p.look } : {};
    const seatLooks = Array.isArray(p.seatLooks) ? { seatLooks: p.seatLooks.map((l) => (isLook(l) ? l : null)) } : {};
    return { experience: p.experience, unlocks, ...(typeof p.lastRun === "string" ? { lastRun: p.lastRun } : {}), ...comfort, ...look, ...seatLooks };
  } catch {
    return { ...NEW_PROFILE, unlocks: [] };
  }
}

function saveProfile(profile: StoredProfile): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // storage unavailable: the profile lasts until the page closes
  }
}

// The saved comfort settings; a profile without them gets the defaults from `defaults`.
export function loadComfort(defaults: Comfort): Comfort {
  return loadProfile().comfort ?? defaults;
}

export function saveComfort(comfort: Comfort): void {
  saveProfile({ ...loadProfile(), comfort });
}

// The look saved for online play. A missing or unreadable one is a random one, saved at once so it stays.
export function onlineLook(): Look {
  const saved = loadProfile().look;
  if (saved) return saved;
  const look = randomLook([]);
  saveLook(look);
  return look;
}

export function saveLook(look: Look): void {
  saveProfile({ ...loadProfile(), look });
}

// Single player: the saved look of each seat, by seat number (null where there is none yet).
export function loadSeatLooks(): (Look | null)[] {
  return loadProfile().seatLooks ?? [];
}

export function saveSeatLooks(seatLooks: Look[]): void {
  saveProfile({ ...loadProfile(), seatLooks });
}

export function resetProfile(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // storage unavailable
  }
}

// Debug: everything unlocked, with the experience of the last level.
export function unlockAll(): void {
  const profile = loadProfile();
  const top = data.levels[data.levels.length - 1]?.experience ?? 0;
  saveProfile({ ...profile, experience: Math.max(profile.experience, top), unlocks: allUnlocks(data) });
}

// What the last run paid out, for the run end screen.
export let lastAward: { runId: string; gained: number; newUnlocks: string[] } | null = null;

// A new run is starting: forget the last payout, so the run end screen knows when its own has arrived.
export function clearAward(): void {
  lastAward = null;
}

// Adds a finished run's experience, once per run id.
export function awardExperience(runId: string, gained: number): void {
  const profile = loadProfile();
  if (profile.lastRun === runId) return;
  const result = applyExperience(data, profile, gained);
  saveProfile({ ...profile, ...result.profile, lastRun: runId }); // the rest of the profile (comfort, looks) stays
  lastAward = { runId, gained, newUnlocks: result.newUnlocks };
}
