// Checks for data/charms.json. Same style as validate-run.ts.

import type { Charm } from "./types";

const FILE = "data/charms.json";
const SPARKS = ["Ember", "Tide", "Gale", "Storm", "Void", "Rot"];

function fail(id: string, problem: string): never {
  throw new Error(`${FILE}: ${id}: ${problem}`);
}

export function validateCharms(data: unknown): Charm[] {
  if (!Array.isArray(data)) fail("(file)", "must be a list of charms");
  const seen: string[] = [];
  data.forEach((item: unknown, index: number) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) fail(`#${index}`, "must be an object");
    const charm = item as Record<string, unknown>;
    if (typeof charm.id !== "string" || charm.id === "") fail(`#${index}`, `"id" must be a non-empty string`);
    const id = charm.id;
    if (seen.includes(id)) fail(id, "duplicate id");
    seen.push(id);
    for (const field of ["name", "description"]) {
      if (typeof charm[field] !== "string" || charm[field] === "") fail(id, `"${field}" must be a non-empty string`);
    }
    if (charm.pool !== "normal" && charm.pool !== "rare") fail(id, `"pool" must be "normal" or "rare"`);
    if (charm.sparks !== undefined) {
      if (!Array.isArray(charm.sparks) || charm.sparks.length === 0 || charm.sparks.some((s) => !SPARKS.includes(s))) {
        fail(id, `"sparks" must be a non-empty list of sparks`);
      }
    }
    if (id === "lightning_rod" && charm.sparks === undefined) fail(id, `"sparks" is needed`);
    const numbers = charm.numbers;
    if (typeof numbers !== "object" || numbers === null || Array.isArray(numbers)) fail(id, `"numbers" must be an object`);
    if (id === "overcharge" && (numbers as Record<string, unknown>).multiplierAdd === undefined) fail(id, `numbers.multiplierAdd is needed`);
    for (const [key, value] of Object.entries(numbers)) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(id, `numbers.${key} must be a number, 0 or more`);
    }
  });
  return data as Charm[];
}
