// Hand-written checks for the JSON files in data/. Each function throws an
// Error naming the file, the item id and the problem. Plain code on purpose,
// so it is easy to rewrite in GDScript.

import type { Config, DeckList, Domino, Enemy, EnemyDomino, Pools } from "./types";

const SPARKS = ["Ember", "Tide", "Gale", "Storm", "Void", "Rot"];
const DOMINO_KINDS = ["amplifier", "junction", "cap"];
const AMP_OPS = ["add", "mul", "echo", "spectrum"];
const CAP_EFFECT_KINDS = ["damage", "block", "coins"];
const KINDS_WITH_BASE = ["damage", "block", "heal", "amplify"];
const TIERS = ["basic", "elite", "boss"];
const RARITIES = ["common", "uncommon", "rare"];
const BATTLE_TYPES = ["fight", "elite", "boss"];
const POOL_KINDS = ["damage", "block", "amplify", "echo", "lookout", "mimic"]; // never heal or reflect
const PASSIVE_KINDS = ["auditor", "glutton", "hoarder", "smolder", "longNight", "warden"];

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
    const kind = item.kind;
    if (typeof kind !== "string" || !DOMINO_KINDS.includes(kind)) fail(file, id, `unknown kind ${JSON.stringify(kind)}`);
    if (item.intake !== "any") checkSparkList(file, id, "intake", item.intake);
    if (!Array.isArray(item.output)) fail(file, id, `"output" must be a list of sparks`);
    const outputCount = kind === "amplifier" ? 1 : kind === "junction" ? 2 : 0;
    if (item.output.length !== outputCount) fail(file, id, `a ${kind} needs exactly ${outputCount} output spark(s)`);
    if (outputCount > 0) checkSparkList(file, id, "output", item.output);
    if (kind === "amplifier") {
      const amp = item.amp;
      if (!isObject(amp)) fail(file, id, `an amplifier needs "amp": { op, value }`);
      if (typeof amp.op !== "string" || !AMP_OPS.includes(amp.op)) fail(file, id, `unknown amp op ${JSON.stringify(amp.op)}`);
      checkPositive(file, id, amp, "value");
    } else if (item.amp !== undefined) {
      fail(file, id, `only amplifiers have "amp"`);
    }
    if (kind === "cap") {
      const effect = item.effect;
      if (!isObject(effect)) fail(file, id, `a cap needs "effect": { kind, base }`);
      if (typeof effect.kind !== "string" || !CAP_EFFECT_KINDS.includes(effect.kind)) {
        fail(file, id, `unknown effect kind ${JSON.stringify(effect.kind)}`);
      }
      checkPositive(file, id, effect, "base");
      if (effect.ignoresBlock !== undefined) {
        if (typeof effect.ignoresBlock !== "boolean") fail(file, id, `effect "ignoresBlock" must be true or false`);
        if (effect.kind !== "damage") fail(file, id, `effect "ignoresBlock" is for damage only`);
      }
      for (const field of Object.keys(effect)) {
        if (!["kind", "base", "ignoresBlock"].includes(field)) fail(file, id, `unknown effect field "${field}"`);
      }
    } else if (item.effect !== undefined) {
      fail(file, id, `only caps have "effect"`);
    }
    if (item.rarity !== undefined && (typeof item.rarity !== "string" || !RARITIES.includes(item.rarity))) {
      fail(file, id, `unknown rarity ${JSON.stringify(item.rarity)}`);
    }
  });
  return data as Domino[];
}

// Temporary check for the old-shape enemy dominoes. #182 deletes it with data/enemy-dominoes.json.
export function validateEnemyDominoes(data: unknown): EnemyDomino[] {
  const file = "data/enemy-dominoes.json";
  if (!Array.isArray(data)) fail(file, "(file)", "must be a list of dominoes");
  const seen: string[] = [];
  data.forEach((item: unknown, index: number) => {
    if (!isObject(item)) fail(file, `#${index}`, "must be an object");
    if (typeof item.id !== "string" || item.id === "") fail(file, `#${index}`, `"id" must be a non-empty string`);
    const id = item.id;
    if (seen.includes(id)) fail(file, id, "duplicate id");
    seen.push(id);
    checkString(file, id, item, "name");
    checkSparkList(file, id, "intake", item.intake);
    checkSparkList(file, id, "output", item.output);
    const effect = item.effect;
    if (!isObject(effect)) fail(file, id, `"effect" must be an object`);
    if (typeof effect.kind !== "string" || !["damage", "block", "heal", "reflect"].includes(effect.kind)) {
      fail(file, id, `unknown effect kind ${JSON.stringify(effect.kind)}`);
    }
    if (effect.kind !== "reflect" && !isNumber(effect.base)) fail(file, id, `effect "${effect.kind}" needs a numeric "base"`);
  });
  return data as EnemyDomino[];
}

export function validateEnemies(data: unknown, dominoes: EnemyDomino[]): Enemy[] {
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
      if (typeof passive.name !== "string" || passive.name === "") fail(file, id, `passive "name" must be a non-empty string`);
      if (passive.text !== undefined && typeof passive.text !== "string") fail(file, id, `passive "text" must be a string`);
      // Parameters are optional overrides of Config; check them when present.
      if (passive.kind === "auditor" && passive.damage !== undefined) checkAuditorDamage(file, id, passive.damage);
      if (passive.kind === "warden") {
        const sparks = passive.sparks;
        if (!Array.isArray(sparks) || sparks.length === 0 || sparks.some((x) => typeof x !== "string" || !SPARKS.includes(x))) {
          fail(file, id, `warden "sparks" must be a non-empty list of sparks`);
        }
      }
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
  for (const field of ["partyMaxHealth", "playerDrawPerRound", "playerFirstDraw", "playerHandLimit", "triggerCap", "gluttonHeal"]) {
    checkPositive(file, id, data, field);
  }
  if (typeof data.enemyReactionsScaleWithLap !== "boolean") fail(file, id, `"enemyReactionsScaleWithLap" must be true or false`);
  const pct = data.enemyHealthPercentByPartySize;
  if (!Array.isArray(pct) || pct.length !== 4 || !pct.every((p) => typeof p === "number" && Number.isInteger(p) && p > 0)) {
    fail(file, id, `"enemyHealthPercentByPartySize" must be 4 whole numbers above 0 (party sizes 1 to 4)`);
  }
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

export function validatePools(data: unknown): Pools {
  const file = "data/domino-pools.json";
  const id = "(pools)";
  if (!isObject(data)) fail(file, id, "must be an object");
  checkPositive(file, id, data, "offerSize");
  if (!Number.isInteger(data.offerSize)) fail(file, id, `"offerSize" must be a whole number`);
  const groups = data.sparkGroups;
  if (!isObject(groups)) fail(file, id, `"sparkGroups" must be an object`);
  for (const g of ["basic", "advanced"]) {
    checkSparkList(file, `${id} sparkGroups`, g, groups[g]);
    if ((groups[g] as string[]).includes("Rot")) fail(file, `${id} sparkGroups`, `"${g}" must not contain Rot`);
  }
  const basic = groups.basic as string[];
  const advanced = groups.advanced as string[];
  if (basic.some((s) => advanced.includes(s))) fail(file, `${id} sparkGroups`, "a spark can't be both basic and advanced");
  const rarities = data.rarities;
  if (!isObject(rarities)) fail(file, id, `"rarities" must be an object`);
  for (const rarity of RARITIES) {
    const pool = rarities[rarity];
    const pid = `${rarity} pool`;
    if (!isObject(pool)) fail(file, id, `"rarities" needs "${rarity}"`);
    // Intakes: common and uncommon take one basic spark; rare takes one advanced spark or "any". No dual intakes.
    if (!Array.isArray(pool.intakes) || pool.intakes.length === 0) fail(file, pid, `"intakes" must be a non-empty list`);
    for (const intake of pool.intakes as unknown[]) {
      if (intake === "any") {
        if (rarity !== "rare") fail(file, pid, `"any" intake is rare only`);
        continue;
      }
      checkSparkList(file, pid, "intakes", intake);
      const sparks = intake as string[];
      if (sparks.length !== 1) fail(file, pid, "intakes must be a single spark (no dual intakes)");
      const allowed = rarity === "rare" ? advanced : basic;
      if (!allowed.includes(sparks[0])) fail(file, pid, `${rarity} intake ${sparks[0]} must be ${rarity === "rare" ? "advanced" : "basic"}`);
    }
    // Outputs are listed as basic sparks. Only uncommons swap some for advanced ones, by this share.
    const share = pool.advancedOutputShare;
    if (!isNumber(share) || (share as number) < 0 || (share as number) > 1) fail(file, pid, `"advancedOutputShare" must be a number from 0 to 1`);
    if (rarity !== "uncommon" && share !== 0) fail(file, pid, `"advancedOutputShare" must be 0 (advanced outputs are uncommon only)`);
    const traits = pool.traits;
    if (!isObject(traits)) fail(file, pid, `"traits" must be an object`);
    for (const t of ["spectrum", "ignoresBlock"]) {
      if (!isNumber(traits[t]) || (traits[t] as number) < 0 || (traits[t] as number) > 1) {
        fail(file, pid, `trait chance "${t}" must be a number from 0 to 1`);
      }
      if (rarity === "common" && traits[t] !== 0) fail(file, pid, `trait "${t}" is uncommon and rare only`);
    }
    if (!Array.isArray(pool.effects) || pool.effects.length === 0) fail(file, pid, `"effects" must be a non-empty list`);
    (pool.effects as unknown[]).forEach((effect, i) => {
      const eid = `${rarity} effect #${i}`;
      if (!isObject(effect)) fail(file, eid, "must be an object");
      if (typeof effect.kind !== "string" || !POOL_KINDS.includes(effect.kind)) {
        fail(file, eid, `kind ${JSON.stringify(effect.kind)} is not allowed in pools (no heal, no reflect)`);
      }
      if (rarity !== "rare" && effect.kind === "mimic") fail(file, eid, "mimic is rare only");
      if (rarity === "common" && !["damage", "block"].includes(effect.kind)) fail(file, eid, "common is damage or block only");
      if (!Array.isArray(effect.names) || effect.names.length === 0 || effect.names.some((n) => typeof n !== "string" || n === "")) {
        fail(file, eid, `"names" must be a non-empty list of words`);
      }
      const range = effect.base;
      if (KINDS_WITH_BASE.includes(effect.kind)) {
        if (!Array.isArray(range) || range.length !== 2 || !Number.isInteger(range[0]) || !Number.isInteger(range[1]) || range[0] < 1 || range[0] > range[1]) {
          fail(file, eid, `"base" must be [min, max], whole numbers, 1 or more, min not above max`);
        }
      } else if (range !== undefined) {
        fail(file, eid, `effect "${effect.kind}" must not have a "base"`);
      }
      if (effect.traits !== undefined) {
        if (!Array.isArray(effect.traits) || effect.traits.some((t) => t !== "spectrum" && t !== "ignoresBlock")) {
          fail(file, eid, `"traits" must be a list of "spectrum" and "ignoresBlock"`);
        }
        if (effect.traits.includes("ignoresBlock") && effect.kind !== "damage") fail(file, eid, `"ignoresBlock" is for damage only`);
      }
      if (!Array.isArray(effect.outputs) || effect.outputs.length === 0) fail(file, eid, `"outputs" must be a non-empty list`);
      for (const out of effect.outputs as unknown[]) {
        checkSparkList(file, eid, "outputs", out);
        for (const spark of out as string[]) {
          if (spark === "Rot") fail(file, eid, "generated dominoes never output Rot");
          if (!basic.includes(spark as string)) fail(file, eid, `output ${spark} must be basic (uncommons get advanced ones from "advancedOutputShare")`);
        }
        if ((out as string[]).length > 2) fail(file, eid, "outputs have at most two sparks");
        if (rarity === "common" && (out as string[]).length !== 1) fail(file, eid, "common outputs one spark");
      }
    });
  }
  return data as unknown as Pools;
}
