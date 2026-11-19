// Progression: experience, levels and unlocks. A profile is plain data { experience, unlocks }.
// Pure functions; the host and screens (later issues) keep and pass the profiles.

import type { RunState } from "./run";
import type { ProgressionData } from "./types";

export interface Profile {
  experience: number;
  unlocks: string[]; // unlock ids, in the order they were earned
}

export const NEW_PROFILE: Profile = { experience: 0, unlocks: [] };

// Level 0 is a new player; level N has reached levels[N-1].experience.
export function levelFor(data: ProgressionData, experience: number): number {
  return data.levels.filter((l) => experience >= l.experience).length;
}

// Every unlock id: what a debug "unlock all" gives.
export function allUnlocks(data: ProgressionData): string[] {
  return data.levels.map((l) => l.unlock);
}

// What a finished run earns each player, broken down: floors cleared, bosses beaten, and the win bonus.
export interface ExperienceBreakdown {
  floors: number;
  floorXp: number;
  bosses: number;
  bossXp: number;
  winXp: number;
  total: number;
}

export function experienceBreakdown(run: RunState): ExperienceBreakdown {
  const x = run.content.progression.experience;
  const won = run.result === "won";
  const acts = run.content.run.acts;
  let floors = 0;
  for (let i = 0; i < run.actIndex; i++) floors += acts[i].map.floors; // acts already beaten
  if (won) floors += acts[run.actIndex].map.floors;
  else if (run.position) floors += Math.min(run.position.floor - 1, acts[run.actIndex].map.floors); // the floor you fell on is not cleared
  const bosses = run.actIndex + (won ? 1 : 0);
  const floorXp = floors * x.perFloor;
  const bossXp = bosses * x.perBoss;
  const winXp = won ? x.forWin : 0;
  return { floors, floorXp, bosses, bossXp, winXp, total: floorXp + bossXp + winXp };
}

export function runExperience(run: RunState): number {
  return experienceBreakdown(run).total;
}

// Where an experience total stands: the level, the span of the current level (from..to) and the
// unlock the next level gives. After the last level next is null and the bar is full.
export interface LevelProgress {
  level: number;
  from: number;
  to: number | null;
  next: { name: string; description: string } | null;
}

export function levelProgress(data: ProgressionData, experience: number): LevelProgress {
  const level = levelFor(data, experience);
  const from = level === 0 ? 0 : data.levels[level - 1].experience;
  const next = data.levels[level];
  return { level, from, to: next ? next.experience : null, next: next ? { name: next.name, description: next.description } : null };
}

// Adds experience; returns the new profile and the unlocks it just earned.
export function applyExperience(data: ProgressionData, profile: Profile, gained: number): { profile: Profile; newUnlocks: string[] } {
  const experience = profile.experience + gained;
  const earned = data.levels.filter((l) => experience >= l.experience).map((l) => l.unlock);
  const newUnlocks = earned.filter((id) => !profile.unlocks.includes(id));
  return { profile: { experience, unlocks: [...profile.unlocks, ...newUnlocks] }, newUnlocks };
}

// The unlocks generation uses for one player: null means everything (no unlocks stored, or the player has no entry).
export function unlocksOf(unlocks: Record<string, string[]> | undefined, player: string): string[] | null {
  return unlocks?.[player] ?? null;
}

// The party's combined unlocks (the Lost Courier's domino); null if anyone has everything.
export function partyUnlocks(unlocks: Record<string, string[]> | undefined, players: string[]): string[] | null {
  const out: string[] = [];
  for (const id of players) {
    const u = unlocksOf(unlocks, id);
    if (u === null) return null;
    for (const x of u) if (!out.includes(x)) out.push(x);
  }
  return out;
}
