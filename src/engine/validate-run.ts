// Checks for data/run.json (acts and map rules). Same style as validate.ts.

import type { Enemy, RunData } from "./types";

const NODE_TYPES = ["fight", "elite", "rest", "trader", "event"];
const BATTLE_TYPES = ["fight", "elite", "boss"];
const RARITIES = ["common", "uncommon", "rare"];
const FILE = "data/run.json";

function fail(id: string, problem: string): never {
  throw new Error(`${FILE}: ${id}: ${problem}`);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkWhole(id: string, v: unknown, what: string, min: number): void {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min) fail(id, `${what} must be a whole number, ${min} or more`);
}

// Weights for common, uncommon and rare: numbers, 0 or more, not all 0.
function checkOdds(id: string, v: unknown, what: string): void {
  if (!isObject(v)) fail(id, `${what} must be an object`);
  let total = 0;
  for (const rarity of RARITIES) {
    const w = v[rarity];
    if (typeof w !== "number" || !Number.isFinite(w) || w < 0) fail(id, `${what}.${rarity} must be a number, 0 or more`);
    total += w;
  }
  if (total <= 0) fail(id, `${what} needs some weight above 0`);
}

function checkEnemyPool(id: string, v: unknown, what: string, tier: string, enemies: Enemy[]): void {
  if (!Array.isArray(v) || v.length === 0) fail(id, `"${what}" must be a non-empty list of enemy ids`);
  for (const enemyId of v as unknown[]) {
    const enemy = enemies.find((e) => e.id === enemyId);
    if (enemy === undefined || enemy.tier !== tier) fail(id, `${what} has ${JSON.stringify(enemyId)}, which is not a ${tier} enemy`);
  }
}

function checkRange(id: string, v: unknown, what: string): void {
  if (!isObject(v)) fail(id, `${what} must be an object with "min" and "max"`);
  checkWhole(id, v.min, `${what}.min`, 1);
  checkWhole(id, v.max, `${what}.max`, 1);
  if ((v.min as number) > (v.max as number)) fail(id, `${what}.min must not be above max`);
}

export function validateRun(data: unknown, enemies: Enemy[]): RunData {
  if (!isObject(data) || !Array.isArray(data.acts) || data.acts.length === 0) fail("(file)", `"acts" must be a non-empty list`);
  checkWhole("(file)", data.startingCoins, "startingCoins", 0);
  checkWhole("(file)", data.actStartHealPercent, "actStartHealPercent", 0);
  checkWhole("(file)", data.restHeal, "restHeal", 1);
  if (!isObject(data.upgrade)) fail("(file)", `"upgrade" must be an object`);
  for (const field of ["numberedPercent", "amplify", "echoTriggers", "lookoutReveals", "mimicStrength"]) {
    checkWhole("(file)", data.upgrade[field], `upgrade.${field}`, 1);
  }
  const trader = data.trader;
  if (!isObject(trader)) fail("(file)", `"trader" must be an object`);
  checkWhole("trader", trader.stockSize, "stockSize", 1);
  checkWhole("trader", trader.removalFeeStart, "removalFeeStart", 0);
  checkWhole("trader", trader.removalFeeStep, "removalFeeStep", 0);
  checkWhole("trader", trader.minDeckSize, "minDeckSize", 1);
  checkWhole("trader", trader.charmStockSize, "charmStockSize", 0);
  checkWhole("trader", trader.charmPrice, "charmPrice", 0);
  if (!isObject(data.charmOffers)) fail("(file)", `"charmOffers" must be an object`);
  for (const type of ["elite", "boss"]) checkWhole("(file)", data.charmOffers[type], `charmOffers.${type}`, 0);
  if (!isObject(trader.prices)) fail("trader", `"prices" must be an object`);
  for (const rarity of RARITIES) checkWhole("trader", trader.prices[rarity], `prices.${rarity}`, 0);
  const seen: string[] = [];
  (data.acts as unknown[]).forEach((act: unknown, index: number) => {
    if (!isObject(act)) fail(`#${index}`, "must be an object");
    if (typeof act.id !== "string" || act.id === "") fail(`#${index}`, `"id" must be a non-empty string`);
    const id = act.id;
    if (seen.includes(id)) fail(id, "duplicate id");
    seen.push(id);
    checkEnemyPool(id, act.bossPool, "bossPool", "boss", enemies);
    checkEnemyPool(id, act.normalPool, "normalPool", "basic", enemies);
    checkEnemyPool(id, act.elitePool, "elitePool", "elite", enemies);
    if (!isObject(act.battleCoins)) fail(id, `"battleCoins" must be an object`);
    for (const type of BATTLE_TYPES) checkWhole(id, act.battleCoins[type], `battleCoins.${type}`, 0);
    if (!isObject(act.rewardOdds)) fail(id, `"rewardOdds" must be an object`);
    for (const type of BATTLE_TYPES) checkOdds(id, act.rewardOdds[type], `rewardOdds.${type}`);
    checkOdds(id, act.traderOdds, "traderOdds");
    const map = act.map;
    if (!isObject(map)) fail(id, `"map" must be an object`);
    checkWhole(id, map.floors, "map.floors", 1);
    const floors = map.floors as number;
    checkRange(id, map.nodesPerFloor, "map.nodesPerFloor");
    checkRange(id, map.nextPerNode, "map.nextPerNode");
    if (!isObject(map.fixedFloors)) fail(id, `"fixedFloors" must be an object`);
    for (const [floor, type] of Object.entries(map.fixedFloors)) {
      const n = Number(floor);
      if (!Number.isInteger(n) || n < 1 || n > floors) fail(id, `fixedFloors has floor ${floor} outside 1-${floors}`);
      if (typeof type !== "string" || !NODE_TYPES.includes(type)) fail(id, `fixedFloors floor ${floor} has unknown node type ${JSON.stringify(type)}`);
    }
    if (!isObject(map.weights)) fail(id, `"weights" must be an object`);
    for (const type of NODE_TYPES) {
      const w = map.weights[type];
      if (typeof w !== "number" || !Number.isFinite(w) || w < 0) fail(id, `weights.${type} must be a number, 0 or more`);
    }
    if ((map.weights.fight as number) <= 0) fail(id, `weights.fight must be above 0`);
    checkWhole(id, map.eliteMinFloor, "eliteMinFloor", 1);
    checkWhole(id, map.restMinFloor, "restMinFloor", 1);
    if (!Array.isArray(map.restBannedFloors)) fail(id, `"restBannedFloors" must be a list of floors`);
    for (const f of map.restBannedFloors as unknown[]) checkWhole(id, f, "restBannedFloors entry", 1);
    checkWhole(id, map.maxRestPerPath, "maxRestPerPath", 0);
    checkWhole(id, map.maxTraderPerPath, "maxTraderPerPath", 0);
    checkWhole(id, map.minTradersPerAct, "minTradersPerAct", 0);
    checkWhole(id, map.maxAttempts, "maxAttempts", 1);
  });
  return data as unknown as RunData;
}
