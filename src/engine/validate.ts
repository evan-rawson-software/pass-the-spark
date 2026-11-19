// Hand-written checks for the JSON files in data/. Each function throws an
// Error naming the file, the item id and the problem. Plain code on purpose,
// so it is easy to rewrite in GDScript.

import type { Config, DeckList, Domino, Enemy } from "./types";

const SPARKS = ["Ember", "Tide", "Gale", "Storm", "Void", "Rot"];
const EFFECT_KINDS = ["damage", "block", "heal", "amplify", "echo", "mimic", "reflect", "lookout"];
const KINDS_WITH_BASE = ["damage", "block", "heal", "amplify"];
const TIERS = ["basic", "elite", "boss"];
const PASSIVE_KINDS = ["auditor", "glutton"];

function fail(file: string, id: string, problem: string): never {
  throw new Error(`${file}: ${id}: ${problem}`);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v);
}

function checkString(file: string, id: string, obj: Record<string, unknown>, field: string): void {
  if (typeof obj[field] !== "string" || obj[field] === "") fail(file, id, `"${field}" must be a non-empty string`);
}

function checkPositive(file: string, id: string, obj: Record<string, unknown>, field: string): void {
  if (!isNumber(obj[field]) || (obj[field] as number) <= 0) fail(file, id, `"${field}" must be a positive number`);
}

function checkSparkList(file: string, id: string, field: string, list: unknown): void {
  if (!Array.isArray(list) || list.length === 0) fail(file, id, `"${field}" must be a non-empty list of sparks`);
  for (const spark of list as unknown[]) {
    if (typeof spark !== "string" || !SPARKS.includes(spark)) fail(file, id, `"${field}" has unknown spark ${JSON.stringify(spark)}`);
  }
}

function checkAuditorDamage(file: string, id: string, damage: unknown): void {
  if (!isObject(damage)) fail(file, id, `auditor damage must be an object`);
  if (damage.rule === "flat") {
    checkPositive(file, id, damage, "amount");
  } else if (damage.rule !== "strength") {
    fail(file, id, `auditor damage "rule" must be "strength" or "flat"`);
  }
}

// `file` names the source in error messages (extra definitions passed to createBattle use their own name).
export function validateDominoes(data: unknown, file = "data/dominoes.json"): Domino[] {
  if (!Array.isArray(data)) fail(file, "(file)", "must be a list of dominoes");
  const seen: string[] = [];
  data.forEach((item: unknown, index: number) => {
    if (!isObject(item)) fail(file, `#${index}`, "must be an object");
    if (typeof item.id !== "string" || item.id === "") fail(file, `#${index}`, `"id" must be a non-empty string`);
    const id = item.id;
    if (seen.includes(id)) fail(file, id, "duplicate id");
    seen.push(id);
    checkString(file, id, item, "name");
    if (item.intake !== "any") checkSparkList(file, id, "intake", item.intake);
    checkSparkList(file, id, "output", item.output);
    const effect = item.effect;
    if (!isObject(effect)) fail(file, id, `"effect" must be an object`);
    if (typeof effect.kind !== "string" || !EFFECT_KINDS.includes(effect.kind)) {
      fail(file, id, `unknown effect kind ${JSON.stringify(effect.kind)}`);
    }
    if (KINDS_WITH_BASE.includes(effect.kind)) {
      if (!isNumber(effect.base)) fail(file, id, `effect "${effect.kind}" needs a numeric "base"`);
    } else if (effect.base !== undefined) {
      fail(file, id, `effect "${effect.kind}" must not have a "base"`);
    }
    // Upgrade parameters: whole numbers of 0 or more, each only on its own effect kind.
    for (const [field, kind] of [["extraTriggers", "echo"], ["extraReveals", "lookout"], ["strengthBonus", "mimic"]]) {
      const n = effect[field];
      if (n === undefined) continue;
      if (effect.kind !== kind) fail(file, id, `effect "${field}" is only for "${kind}"`);
      if (!Number.isInteger(n) || (n as number) < 0) fail(file, id, `effect "${field}" must be a whole number, 0 or more`);
    }
    for (const flag of ["spectrum", "ignoresBlock"]) {
      if (effect[flag] !== undefined && typeof effect[flag] !== "boolean") fail(file, id, `effect "${flag}" must be true or false`);
    }
  });
  return data as Domino[];
}

export function validateEnemies(data: unknown, dominoes: Domino[]): Enemy[] {
  const file = "data/enemies.json";
  if (!Array.isArray(data)) fail(file, "(file)", "must be a list of enemies");
  const dominoIds = dominoes.map((d) => d.id);
  const seen: string[] = [];
  data.forEach((item: unknown, index: number) => {
    if (!isObject(item)) fail(file, `#${index}`, "must be an object");
    if (typeof item.id !== "string" || item.id === "") fail(file, `#${index}`, `"id" must be a non-empty string`);
    const id = item.id;
    if (seen.includes(id)) fail(file, id, "duplicate id");
    seen.push(id);
    checkString(file, id, item, "name");
    if (typeof item.tier !== "string" || !TIERS.includes(item.tier)) fail(file, id, `unknown tier ${JSON.stringify(item.tier)}`);
    checkPositive(file, id, item, "maxHealth");
    checkPositive(file, id, item, "drawPerRound");
    checkPositive(file, id, item, "handLimit");
    if (!Array.isArray(item.deck) || item.deck.length === 0) fail(file, id, `"deck" must be a non-empty list of domino ids`);
    for (const dominoId of item.deck as unknown[]) {
      if (typeof dominoId !== "string" || !dominoIds.includes(dominoId)) {
        fail(file, id, `deck has unknown domino id ${JSON.stringify(dominoId)}`);
      }
    }
    if (!Array.isArray(item.passives)) fail(file, id, `"passives" must be a list`);
    for (const passive of item.passives as unknown[]) {
      if (!isObject(passive) || typeof passive.kind !== "string" || !PASSIVE_KINDS.includes(passive.kind)) {
        fail(file, id, `unknown passive ${JSON.stringify(passive)}`);
      }
      // Parameters are optional overrides of Config; check them when present.
      if (passive.kind === "auditor" && passive.damage !== undefined) checkAuditorDamage(file, id, passive.damage);
      if (passive.kind === "glutton" && passive.heal !== undefined && (!isNumber(passive.heal) || (passive.heal as number) <= 0)) {
        fail(file, id, `glutton "heal" must be a positive number`);
      }
    }
  });
  return data as Enemy[];
}

export function validateConfig(data: unknown): Config {
  const file = "data/config.json";
  const id = "(config)";
  if (!isObject(data)) fail(file, id, "must be an object");
  for (const field of ["partyMaxHealth", "playerDrawPerRound", "playerHandLimit", "triggerCap", "gluttonHeal"]) {
    checkPositive(file, id, data, field);
  }
  if (typeof data.enemyReactionsScaleWithLap !== "boolean") fail(file, id, `"enemyReactionsScaleWithLap" must be true or false`);
  checkAuditorDamage(file, id, data.auditorDamage);
  return data as unknown as Config;
}

export function validateStarterDeck(data: unknown, dominoes: Domino[]): DeckList {
  const file = "data/starter-deck.json";
  if (!Array.isArray(data) || data.length === 0) fail(file, "(file)", "must be a non-empty list of domino ids");
  const dominoIds = dominoes.map((d) => d.id);
  for (const dominoId of data as unknown[]) {
    if (typeof dominoId !== "string" || !dominoIds.includes(dominoId)) {
      fail(file, "(starter deck)", `unknown domino id ${JSON.stringify(dominoId)}`);
    }
  }
  return data as DeckList;
}
