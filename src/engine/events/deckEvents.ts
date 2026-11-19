// The three events that change dominoes in a deck: the Tinker's Bench (flip or repaint), the Mirror
// Pond (copy) and the Twin Forge (weld). Pure previews plus the handlers that apply them; the shared
// personal-event machinery is in personal.ts. Numbers (repaint cost, minimum deck) come from data.
// Upgrade marks and traits live on the domino, so a flip or repaint keeps them, a copy has them too,
// and a weld takes the first domino's (intake, effect, upgrade marks, traits).

import type { RunState } from "../run";
import type { Domino, Rarity, Spark } from "../types";
import type { EventPick, PersonalAction, PersonalHandler, PersonalResult } from "./personal";

const RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2 };

export interface Preview {
  before: Domino[];
  after: Domino;
}

// One way to repaint a domino: replace the spark in this slot of this half.
export interface RepaintChoice {
  half: "intake" | "output";
  slot: number;
  from: Spark;
  spark: Spark;
}

function copyOf(d: Domino): Domino {
  return JSON.parse(JSON.stringify(d));
}

function find(run: RunState, player: string, id: string): Domino {
  const deck = run.decks[player];
  const domino = deck?.includes(id) ? run.dominoes.find((d) => d.id === id) : undefined;
  if (!domino) throw new Error(`player ${player} has no domino ${id}`);
  return domino;
}

function groupOf(run: RunState, spark: Spark): Spark[] | null {
  const groups = run.content.pools.sparkGroups;
  if (groups.basic.includes(spark)) return groups.basic;
  if (groups.advanced.includes(spark)) return groups.advanced;
  return null; // Rot has no group
}

// The single sparks the domino's rarity allows on a half (starters count as common).
// Intake: the pool's intakes. Output: the pool's outputs, plus advanced sparks when the rarity can roll them.
function allowedOnHalf(run: RunState, rarity: Rarity | undefined, half: "intake" | "output"): Spark[] {
  const pool = run.content.pools.rarities[rarity ?? "common"];
  const sparks: Spark[] = [];
  const add = (s: Spark) => {
    if (!sparks.includes(s)) sparks.push(s);
  };
  if (half === "intake") {
    for (const intake of pool.intakes) if (intake !== "any") add(intake[0]);
  } else {
    for (const e of pool.effects) for (const out of e.outputs) out.forEach(add);
    if (pool.advancedOutputShare > 0) run.content.pools.sparkGroups.advanced.forEach(add);
  }
  return sparks;
}

// Every repaint this domino can take. Empty for an "any" intake or when nothing else is allowed.
export function repaintChoices(run: RunState, player: string, id: string): RepaintChoice[] {
  const d = find(run, player, id);
  const choices: RepaintChoice[] = [];
  const halves: ["intake" | "output", Spark[]][] = [
    ["intake", d.intake === "any" ? [] : d.intake],
    ["output", d.output],
  ];
  for (const [half, sparks] of halves) {
    sparks.forEach((from, slot) => {
      const group = groupOf(run, from);
      if (!group) return;
      for (const spark of allowedOnHalf(run, d.rarity, half)) {
        if (group.includes(spark) && !sparks.includes(spark)) choices.push({ half, slot, from, spark });
      }
    });
  }
  return choices;
}

function flipReason(d: Domino): string | null {
  if (d.intake === "any") return "Takes any spark";
  if (d.intake.length !== 1) return "Takes two sparks";
  if (d.output.length !== 1) return "Gives off two sparks";
  return null;
}

function higher(a: Rarity | undefined, b: Rarity | undefined): Rarity | undefined {
  if (a === undefined && b === undefined) return undefined;
  return RANK[a ?? "common"] >= RANK[b ?? "common"] ? (a ?? "common") : (b ?? "common");
}

// A name from the effect and the output spark, like the generated ones ("Tide Strike"). The word is
// picked from the pools by the two ids, so the preview and the result agree without the RNG.
function weldName(run: RunState, first: Domino, second: Domino, output: Spark): string {
  const names: string[] = [];
  for (const r of ["common", "uncommon", "rare"] as Rarity[]) {
    for (const e of run.content.pools.rarities[r].effects) if (e.kind === first.effect.kind) for (const n of e.names) if (!names.includes(n)) names.push(n);
  }
  let sum = 0;
  for (const ch of first.id + second.id) sum += ch.charCodeAt(0);
  const word = names.length > 0 ? names[sum % names.length] : first.effect.kind[0].toUpperCase() + first.effect.kind.slice(1);
  return `${output} ${word}${first.upgraded?.length ? "+" : ""}`;
}

// Why this domino can't be picked for the action, or null.
export function dominoUnavailable(run: RunState, player: string, action: PersonalAction, id: string): string | null {
  if (action === "flip") return flipReason(find(run, player, id));
  if (action === "repaint") return repaintChoices(run, player, id).length === 0 ? "No spark on it can be repainted" : null;
  return null;
}

// The domino or dominoes before and the one after. Throws when the pick isn't legal for this player.
// Does not change the run.
export function previewDeckAction(run: RunState, player: string, action: PersonalAction, pick: EventPick | undefined): Preview {
  const ids = pick?.dominoes ?? [];
  if (action === "flip" || action === "repaint" || action === "copy") {
    if (ids.length !== 1) throw new Error("pick one domino");
    const before = find(run, player, ids[0]);
    const after = copyOf(before);
    if (action === "flip") {
      const why = flipReason(before);
      if (why !== null) throw new Error(`${before.id} can't be flipped: ${why}`);
      after.intake = [before.output[0]];
      after.output = [(before.intake as Spark[])[0]];
      after.id = before.id + "+F";
    } else if (action === "repaint") {
      const ok = repaintChoices(run, player, before.id).find((c) => c.half === pick?.half && c.slot === pick?.slot && c.spark === pick?.spark);
      if (!ok) throw new Error(`that repaint is not allowed for ${before.id}`);
      if (ok.half === "intake") (after.intake as Spark[])[ok.slot] = ok.spark;
      else after.output[ok.slot] = ok.spark;
      after.id = before.id + "+P";
    } else {
      after.id = `copy#${run.nextIndex}`;
    }
    return { before: [before], after };
  }
  if (action === "weld") {
    if (ids.length !== 2 || ids[0] === ids[1]) throw new Error("pick two different dominoes");
    const first = find(run, player, ids[0]);
    const second = find(run, player, ids[1]);
    const after = copyOf(first);
    after.output = second.output.slice();
    after.rarity = higher(first.rarity, second.rarity);
    if (after.rarity === undefined) delete after.rarity;
    after.id = `weld#${run.nextIndex}`;
    after.name = weldName(run, first, second, after.output[0]);
    return { before: [first, second], after };
  }
  throw new Error(`${action} is not a deck action`);
}

function replace(run: RunState, player: string, from: Domino, to: Domino): void {
  run.decks[player][run.decks[player].indexOf(from.id)] = to.id;
  run.dominoes[run.dominoes.findIndex((d) => d.id === from.id)] = to;
}

function applyDeckAction(run: RunState, player: string, action: PersonalAction, cost: number, pick: EventPick | undefined): PersonalResult {
  const { before, after } = previewDeckAction(run, player, action, pick);
  if (action === "flip" || action === "repaint") replace(run, player, before[0], after);
  else {
    if (action === "weld") for (const d of before) run.decks[player].splice(run.decks[player].indexOf(d.id), 1);
    run.nextIndex++;
    run.decks[player].push(after.id);
    run.dominoes.push(after);
  }
  run.coins[player] -= cost;
  return { action, cost, before, after };
}

export const deckEventHandlers: Record<"tinkers_bench" | "mirror_pond" | "twin_forge", PersonalHandler> = {
  tinkers_bench: {
    actions: (data) => [
      { action: "flip", cost: 0 },
      { action: "repaint", cost: data.numbers.repaintCost },
    ],
    unavailable(run, player, action, cost) {
      if (action === "repaint" && run.coins[player] < cost) return `Needs ${cost} coins`;
      const ok = run.decks[player].some((id) => dominoUnavailable(run, player, action, id) === null);
      return ok ? null : action === "flip" ? "No domino in your deck can be flipped" : "No domino in your deck can be repainted";
    },
    apply: applyDeckAction,
  },
  mirror_pond: {
    actions: () => [{ action: "copy", cost: 0 }],
    unavailable: () => null,
    apply: applyDeckAction,
  },
  twin_forge: {
    actions: () => [{ action: "weld", cost: 0 }],
    unavailable(run, player) {
      const min = run.content.events.find((e) => e.id === "twin_forge")?.numbers.minDeckSize ?? 0;
      return run.decks[player].length >= min ? null : `Needs a deck of at least ${min} dominoes`;
    },
    apply: applyDeckAction,
  },
};
