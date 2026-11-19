// Upgrades from rest sites. Pure functions: each returns a new domino and changes nothing.
// A side can be upgraded once, so a domino has at most 2 upgrades. The upgraded domino is a new
// definition with a run-unique id ("jab#2" becomes "jab#2+R", then "jab#2+R+L").

import type { RunState } from "./run";
import type { Domino, Rarity, Spark, UpgradeSide } from "./types";

export interface UpgradeOptions {
  left: Spark[]; // the sparks the player may add as a second intake; empty when the left side is closed
  right: boolean; // whether the effect can be upgraded
}

const NUMBERED = ["damage", "block", "heal"];
const RIGHT_KINDS = [...NUMBERED, "amplify", "echo", "lookout", "mimic"];

function findDomino(run: RunState, playerId: string, instanceId: string): Domino {
  const deck = run.decks[playerId];
  if (!deck) throw new Error("no such player " + playerId);
  const domino = deck.includes(instanceId) ? run.dominoes.find((d) => d.id === instanceId) : undefined;
  if (!domino) throw new Error(`player ${playerId} has no domino ${instanceId}`);
  return domino;
}

// The single sparks the pool for this rarity can give. Starter dominoes (no rarity) count as common.
function poolSparks(run: RunState, rarity: Rarity | undefined): Spark[] {
  const sparks: Spark[] = [];
  for (const intake of run.content.pools.rarities[rarity ?? "common"].intakes) {
    if (intake !== "any" && !sparks.includes(intake[0])) sparks.push(intake[0]);
  }
  return sparks;
}

function leftOptions(run: RunState, domino: Domino): Spark[] {
  if (domino.upgraded?.includes("left")) return [];
  if (domino.intake === "any" || domino.intake.length !== 1) return [];
  const original = domino.intake[0];
  return poolSparks(run, domino.rarity).filter((s) => s !== original);
}

function rightOpen(domino: Domino): boolean {
  return !domino.upgraded?.includes("right") && RIGHT_KINDS.includes(domino.effect.kind);
}

// What the player may do with one domino, for the UI.
export function getUpgradeOptions(run: RunState, playerId: string, instanceId: string): UpgradeOptions {
  const domino = findDomino(run, playerId, instanceId);
  return { left: leftOptions(run, domino), right: rightOpen(domino) };
}

// The domino before and after an upgrade. Throws when the upgrade isn't allowed.
// spark is the second intake spark, for the left side only.
export function previewUpgrade(
  run: RunState,
  playerId: string,
  instanceId: string,
  side: UpgradeSide,
  spark?: Spark,
): { before: Domino; after: Domino } {
  const before = findDomino(run, playerId, instanceId);
  const after: Domino = JSON.parse(JSON.stringify(before));
  after.upgraded = [...(before.upgraded ?? []), side];
  after.id = before.id + (side === "left" ? "+L" : "+R");
  if (!after.name.endsWith("+")) after.name += "+";

  if (side === "left") {
    const allowed = leftOptions(run, before);
    if (allowed.length === 0) throw new Error(`${instanceId} can't take a left-side upgrade`);
    if (spark === undefined || !allowed.includes(spark)) throw new Error(`spark ${spark} is not a choice for ${instanceId}`);
    after.intake = [(before.intake as Spark[])[0], spark];
  } else {
    if (spark !== undefined) throw new Error("a right-side upgrade takes no spark");
    if (!rightOpen(before)) throw new Error(`${instanceId} can't take a right-side upgrade`);
    const up = run.content.run.upgrade;
    const effect = after.effect;
    if (NUMBERED.includes(effect.kind)) {
      const base = effect.base as number;
      effect.base = base + Math.ceil((base * up.numberedPercent) / 100);
    } else if (effect.kind === "amplify") effect.base = (effect.base as number) + up.amplify;
    else if (effect.kind === "echo") effect.extraTriggers = (effect.extraTriggers ?? 0) + up.echoTriggers;
    else if (effect.kind === "lookout") effect.extraReveals = (effect.extraReveals ?? 0) + up.lookoutReveals;
    else if (effect.kind === "mimic") effect.strengthBonus = (effect.strengthBonus ?? 0) + up.mimicStrength;
  }
  return { before, after };
}
