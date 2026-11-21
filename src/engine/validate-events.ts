// Checks for data/events.json. Same style as validate.ts.

import type { EventData, Pools } from "./types";
import { PRIZE_KINDS } from "./events/wishingWell";

const FILE = "data/events.json";
const KINDS = ["vote", "personal", "push"];

// Each event's own numbers: the keys it needs, and the kind it must have.
const REQUIRED: Record<string, { kind: string; numbers: string[] }> = {
  toll_bridge: { kind: "vote", numbers: ["payCoins"] },
  tinkers_bench: { kind: "personal", numbers: ["repaintCost"] },
  wishing_well: { kind: "personal", numbers: ["coinPrize", "fallbackCoins"] },
  sleeping_giant: { kind: "push", numbers: ["grabCoins", "wakeStartPercent", "wakeStepPercent", "wakeDamage"] },
  spark_shrine: { kind: "vote", numbers: ["blessedCharge"] },
  lost_courier: { kind: "vote", numbers: ["coinsEach"] },
  mirror_pond: { kind: "personal", numbers: [] },
  twin_forge: { kind: "personal", numbers: ["minDeckSize"] },
};

function fail(id: string, problem: string): never {
  throw new Error(`${FILE}: ${id}: ${problem}`);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// pools gives the sparks every prize table must cover (every basic and advanced spark).
export function validateEvents(data: unknown, pools: Pools): EventData[] {
  if (!isObject(data) || !Array.isArray(data.events) || data.events.length === 0) fail("(file)", `"events" must be a non-empty list`);
  const seen: string[] = [];
  for (const [i, e] of (data.events as unknown[]).entries()) {
    if (!isObject(e)) fail(`#${i}`, "must be an object");
    if (typeof e.id !== "string" || e.id === "") fail(`#${i}`, `"id" must be a non-empty string`);
    const id = e.id;
    if (seen.includes(id)) fail(id, "duplicate id");
    seen.push(id);
    if (typeof e.name !== "string" || e.name === "") fail(id, `"name" must be a non-empty string`);
    if (typeof e.text !== "string" || e.text === "") fail(id, `"text" must be a non-empty string`);
    if (typeof e.kind !== "string" || !KINDS.includes(e.kind)) fail(id, `"kind" must be one of ${KINDS.join(", ")}`);
    if (typeof e.weight !== "number" || !Number.isFinite(e.weight) || e.weight <= 0) fail(id, `"weight" must be a positive number`);
    if (typeof e.enabled !== "boolean") fail(id, `"enabled" must be true or false`);
    if (!isObject(e.numbers)) fail(id, `"numbers" must be an object`);
    for (const [key, v] of Object.entries(e.numbers)) {
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) fail(id, `numbers.${key} must be a whole number, 0 or more`);
    }
    if (id === "wishing_well") {
      const prizes = e.prizes;
      if (!isObject(prizes)) fail(id, `"prizes" must be an object keyed by spark`);
      for (const spark of [...pools.sparkGroups.basic, ...pools.sparkGroups.advanced]) {
        if (!PRIZE_KINDS.includes(prizes[spark] as never)) fail(id, `prizes.${spark} must be one of ${PRIZE_KINDS.join(", ")}`);
      }
    }
    const required = REQUIRED[id];
    if (required === undefined) fail(id, "unknown event id");
    if (e.kind !== required.kind) fail(id, `"kind" must be ${required.kind}`);
    for (const key of required.numbers) {
      if (e.numbers[key] === undefined) fail(id, `numbers.${key} is missing`);
    }
  }
  const shrine = (data.events as EventData[]).find((e) => e.id === "spark_shrine");
  if (shrine && shrine.numbers.blessedCharge < 1) fail("spark_shrine", "numbers.blessedCharge must be at least 1");
  for (const id of Object.keys(REQUIRED)) {
    if (!seen.includes(id)) fail(id, "missing: every event needs an entry");
  }
  if (!(data.events as EventData[]).some((e) => e.enabled)) fail("(file)", "at least one event must be enabled");
  return data.events as EventData[];
}
