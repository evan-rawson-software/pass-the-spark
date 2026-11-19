import { allUnlocks, applyExperience, NEW_PROFILE } from "../engine/progression";
import type { Profile } from "../engine/progression";
import { content } from "./devBattle";

// This browser's profile (#131): experience and unlocks in localStorage. A missing or unreadable
// one starts fresh. lastRun is the run the experience was last added for, so a run pays out once.

const KEY = "pass-the-spark.profile";
const data = content.progression;

interface StoredProfile extends Profile {
  lastRun?: string;
}

export function loadProfile(): StoredProfile {
  try {
    const p = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<StoredProfile> | null;
    if (!p || typeof p.experience !== "number" || !Number.isFinite(p.experience) || p.experience < 0 || !Array.isArray(p.unlocks)) return { ...NEW_PROFILE, unlocks: [] };
    const unlocks = allUnlocks(data).filter((id) => p.unlocks!.includes(id));
    return { experience: p.experience, unlocks, ...(typeof p.lastRun === "string" ? { lastRun: p.lastRun } : {}) };
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

// Adds a finished run's experience, once per run id.
export function awardExperience(runId: string, gained: number): void {
  const profile = loadProfile();
  if (profile.lastRun === runId) return;
  const result = applyExperience(data, profile, gained);
  saveProfile({ ...result.profile, lastRun: runId });
  lastAward = { runId, gained, newUnlocks: result.newUnlocks };
}
