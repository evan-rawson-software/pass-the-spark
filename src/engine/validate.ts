// Hand-written checks for the JSON files in data/. Each function throws an
// Error naming the file, the item id and the problem. Plain code on purpose,
// so it is easy to rewrite in GDScript.

import type { Config, DeckList, Domino, Enemy, Pools } from "./types";

const SPARKS = ["Ember", "Tide", "Gale", "Storm", "Void", "Rot"];
const DOMINO_KINDS = ["amplifier", "junction", "cap"];
const AMP_OPS = ["add", "mul", "echo", "spectrum"];
const CAP_EFFECT_KINDS = ["damage", "block"];
const TIERS = ["basic", "elite", "boss"];
const RARITIES = ["common", "uncommon", "rare"];
const BATTLE_TYPES = ["fight", "elite", "boss"];
const PASSIVE_KINDS = ["auditor", "glutton", "hoarder", "smolder", "longNight", "warden"];
const PASSIVE_AMOUNTS: Record<string, string> = { auditor: "damage", glutton: "heal", hoarder: "multiplier", smolder: "growth", longNight: "growth" };
const BASIC_SPARKS = ["Ember", "Tide", "Gale"];

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

export function validateEnemies(data: unknown): Enemy[] {
  const file = "data/enemies.json";
  if (!Array.isArray(data)) fail(file, "(file)", "must be a list of enemies");
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
    const intentIds = checkIntents(file, id, item.intents);
    checkPattern(file, id, item.pattern, intentIds);
    if (!Array.isArray(item.passives)) fail(file, id, `"passives" must be a list`);
    for (const passive of item.passives as unknown[]) {
      if (!isObject(passive) || typeof passive.kind !== "string" || !PASSIVE_KINDS.includes(passive.kind)) {
        fail(file, id, `unknown passive ${JSON.stringify(passive)}`);
      }
      if (typeof passive.name !== "string" || passive.name === "") fail(file, id, `passive "name" must be a non-empty string`);
      if (passive.text !== undefined && typeof passive.text !== "string") fail(file, id, `passive "text" must be a string`);
      const amount = PASSIVE_AMOUNTS[passive.kind];
      if (amount !== undefined) checkWhole(file, id, passive, amount);
      if (passive.kind === "warden") {
        const sparks = passive.sparks;
        if (!Array.isArray(sparks) || sparks.length === 0 || sparks.some((x) => typeof x !== "string" || !BASIC_SPARKS.includes(x))) {
          fail(file, id, `warden "sparks" must be a non-empty list of basic sparks (Ember, Tide, Gale)`);
        }
      }
    }
  });
  return data as Enemy[];
}

function checkWhole(file: string, id: string, obj: Record<string, unknown>, field: string): void {
  if (!Number.isInteger(obj[field]) || (obj[field] as number) < 1) fail(file, id, `"${field}" must be a whole number, 1 or more`);
}

// Returns the intent ids.
function checkIntents(file: string, id: string, intents: unknown): string[] {
  if (!Array.isArray(intents) || intents.length === 0) fail(file, id, `"intents" must be a non-empty list`);
  const ids: string[] = [];
  for (const intent of intents as unknown[]) {
    if (!isObject(intent) || typeof intent.id !== "string" || intent.id === "") fail(file, id, `an intent needs a non-empty "id"`);
    const iid = `${id} intent ${intent.id}`;
    if (ids.includes(intent.id)) fail(file, id, `duplicate intent id ${intent.id}`);
    ids.push(intent.id);
    if (!Array.isArray(intent.actions) || intent.actions.length === 0) fail(file, iid, `"actions" must be a non-empty list`);
    for (const action of intent.actions as unknown[]) {
      if (!isObject(action) || (action.kind !== "attack" && action.kind !== "block")) {
        fail(file, iid, `action kind must be "attack" or "block": ${JSON.stringify(action)}`);
      }
      checkWhole(file, iid, action, "value");
      if (action.kind === "attack" && action.hits !== undefined) checkWhole(file, iid, action, "hits");
      if (action.kind === "block" && action.hits !== undefined) fail(file, iid, `a block action has no "hits"`);
    }
  }
  return ids;
}

function checkPattern(file: string, id: string, pattern: unknown, intentIds: string[]): void {
  if (!isObject(pattern)) fail(file, id, `"pattern" must be an object`);
  if (pattern.type === "cycle") {
    const order = pattern.order;
    if (!Array.isArray(order) || order.length === 0) fail(file, id, `cycle "order" must be a non-empty list of intent ids`);
    for (const x of order as unknown[]) if (typeof x !== "string" || !intentIds.includes(x)) fail(file, id, `cycle order has unknown intent ${JSON.stringify(x)}`);
  } else if (pattern.type === "weighted") {
    const weights = pattern.weights;
    if (!isObject(weights) || Object.keys(weights).length < 2) fail(file, id, `weighted "weights" must list at least 2 intents`);
    for (const key of Object.keys(weights)) {
      if (!intentIds.includes(key)) fail(file, id, `weights has unknown intent ${JSON.stringify(key)}`);
      if (!isNumber(weights[key]) || (weights[key] as number) <= 0) fail(file, id, `weight of ${key} must be a number above 0`);
    }
    if (pattern.maxRepeat !== undefined) checkWhole(file, id, pattern, "maxRepeat");
  } else {
    fail(file, id, `pattern type must be "cycle" or "weighted"`);
  }
}

export function validateConfig(data: unknown): Config {
  const file = "data/config.json";
  const id = "(config)";
  if (!isObject(data)) fail(file, id, "must be an object");
  for (const field of ["partyMaxHealth", "playerDrawPerRound", "playerFirstDraw", "playerHandLimit", "triggerCap", "openEndLimit"]) {
    checkPositive(file, id, data, field);
  }
  for (const field of ["enemyHealthPercentByPartySize", "enemyAttackPercentByPartySize"]) {
    const pct = data[field];
    if (!Array.isArray(pct) || pct.length !== 4 || !pct.every((p) => typeof p === "number" && Number.isInteger(p) && p > 0)) {
      fail(file, id, `"${field}" must be 4 whole numbers above 0 (party sizes 1 to 4)`);
    }
  }
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
    // Outputs are single basic sparks. Only uncommons swap some for advanced ones, by this share.
    if (!Array.isArray(pool.outputs) || pool.outputs.length === 0) fail(file, pid, `"outputs" must be a non-empty list of basic sparks`);
    for (const spark of pool.outputs as unknown[]) {
      if (typeof spark !== "string" || !basic.includes(spark)) fail(file, pid, `output ${JSON.stringify(spark)} must be basic (uncommons get advanced ones from "advancedOutputShare")`);
    }
    if ((pool.outputs as string[]).length < 2) fail(file, pid, `"outputs" needs at least two sparks (a junction has two different outputs)`);
    for (const field of ["advancedOutputShare", "ignoresBlock"]) {
      const v = pool[field];
      if (!isNumber(v) || (v as number) < 0 || (v as number) > 1) fail(file, pid, `"${field}" must be a number from 0 to 1`);
    }
    if (rarity !== "uncommon" && pool.advancedOutputShare !== 0) fail(file, pid, `"advancedOutputShare" must be 0 (advanced outputs are uncommon only)`);
    if (rarity === "common" && pool.ignoresBlock !== 0) fail(file, pid, `"ignoresBlock" is uncommon and rare only`);
    if (!Array.isArray(pool.amplifiers)) fail(file, pid, `"amplifiers" must be a list`);
    if (!Array.isArray(pool.junctions)) fail(file, pid, `"junctions" must be a list of name words`);
    if (!Array.isArray(pool.caps)) fail(file, pid, `"caps" must be a list`);
    const words = (list: unknown, what: string) => {
      if (!Array.isArray(list) || list.length === 0 || list.some((n) => typeof n !== "string" || n === "")) fail(file, pid, `${what}: "names" must be a non-empty list of words`);
    };
    const unlock = (entry: Record<string, unknown>, what: string) => {
      if (entry.unlock !== undefined && (typeof entry.unlock !== "string" || entry.unlock === "")) fail(file, pid, `${what}: "unlock" must be an unlock id`);
    };
    if ((pool.junctions as unknown[]).some((n) => typeof n !== "string" || n === "")) fail(file, pid, `"junctions" must be a list of name words`);
    (pool.amplifiers as unknown[]).forEach((entry, i) => {
      const eid = `amplifier #${i}`;
      if (!isObject(entry)) fail(file, pid, `${eid} must be an object`);
      words(entry.names, eid);
      unlock(entry, eid);
      if (!isObject(entry.amp) || typeof entry.amp.op !== "string" || !AMP_OPS.includes(entry.amp.op)) fail(file, pid, `${eid}: needs "amp": { op, value }`);
      checkPositive(file, pid, entry.amp, "value");
    });
    (pool.caps as unknown[]).forEach((entry, i) => {
      const eid = `cap #${i}`;
      if (!isObject(entry)) fail(file, pid, `${eid} must be an object`);
      words(entry.names, eid);
      unlock(entry, eid);
      if (typeof entry.kind !== "string" || !CAP_EFFECT_KINDS.includes(entry.kind)) fail(file, pid, `${eid}: unknown cap kind ${JSON.stringify(entry.kind)}`);
      const range = entry.base;
      if (!Array.isArray(range) || range.length !== 2 || !Number.isInteger(range[0]) || !Number.isInteger(range[1]) || range[0] < 1 || range[0] > range[1]) {
        fail(file, pid, `${eid}: "base" must be [min, max], whole numbers, 1 or more, min not above max`);
      }
    });
    const weights = pool.kindWeights;
    if (!isObject(weights)) fail(file, pid, `"kindWeights" must be an object`);
    const lists: Record<string, number> = { amplifier: pool.amplifiers.length, junction: pool.junctions.length, cap: pool.caps.length };
    let total = 0;
    for (const kind of DOMINO_KINDS) {
      const w = weights[kind];
      if (!isNumber(w) || (w as number) < 0) fail(file, pid, `kindWeights.${kind} must be a number, 0 or more`);
      if ((w as number) > 0 && lists[kind] === 0) fail(file, pid, `kindWeights.${kind} is above 0 but nothing of that kind is listed`);
      total += w as number;
    }
    if (total <= 0) fail(file, pid, "kindWeights need some weight");
    if (rarity === "common" && !(pool.caps as { kind: string }[]).some((c) => c.kind === "damage")) fail(file, pid, "common needs a damage cap");
  }
  return data as unknown as Pools;
}
