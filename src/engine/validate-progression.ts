// Checks for data/progression.json. Same style as validate-charms.ts.

import type { ProgressionData } from "./types";

const FILE = "data/progression.json";
export const UNLOCK_IDS = ["advancedSparks", "echo", "boostTwo", "ignoresBlock", "spectrum", "double", "anyIntake"];

function fail(id: string, problem: string): never {
  throw new Error(`${FILE}: ${id}: ${problem}`);
}

export function validateProgression(data: unknown): ProgressionData {
  if (typeof data !== "object" || data === null || Array.isArray(data)) fail("(file)", "must be an object");
  const d = data as Record<string, unknown>;
  const xp = d.experience as Record<string, unknown> | undefined;
  if (typeof xp !== "object" || xp === null) fail("experience", "must be an object");
  for (const key of ["perFloor", "perBoss", "forWin"]) {
    const v = xp[key];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) fail("experience", `"${key}" must be a whole number, 0 or more`);
  }
  if (!Array.isArray(d.levels)) fail("levels", "must be a list");
  const seen: string[] = [];
  let last = 0;
  d.levels.forEach((item: unknown, i: number) => {
    const level = item as Record<string, unknown>;
    const id = `level ${i + 1}`;
    if (typeof level !== "object" || level === null) fail(id, "must be an object");
    if (typeof level.experience !== "number" || !Number.isInteger(level.experience) || level.experience <= last) fail(id, `"experience" must be a whole number above the previous level's`);
    last = level.experience;
    if (typeof level.unlock !== "string" || !UNLOCK_IDS.includes(level.unlock)) fail(id, `"unlock" must be one of ${UNLOCK_IDS.join(", ")}`);
    if (seen.includes(level.unlock)) fail(id, `unlock "${level.unlock}" is listed twice`);
    for (const key of ["name", "description"]) if (typeof level[key] !== "string" || level[key] === "") fail(id, `"${key}" must be some text`);
    seen.push(level.unlock);
  });
  if (seen.length !== UNLOCK_IDS.length) fail("levels", "every unlock must be given by exactly one level");
  return data as ProgressionData;
}
