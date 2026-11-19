import { createBattle, getPendingChoice, step } from "../engine/battle";
import type { BattleState } from "../engine/battle";
import { loadContent } from "../engine/content";
import type { DeckList } from "../engine/types";

// Validates all of data/ once, at load; bad content throws here.
export const content = loadContent();
export const dominoes = content.dominoes;
export const enemies = content.enemies;

// What the start screen collects. Seat order is names in order, enemy last;
// the first name leads.
export interface GameSettings {
  names: string[]; // 3 or 4 player names
  enemyId: string;
}

// Kept so "Back to start" shows the settings of the last game.
export let lastSettings: GameSettings | null = null;
export function rememberSettings(settings: GameSettings): void {
  lastSettings = settings;
}

// Dev query params (all optional). When the page is opened with any of them the
// start screen is skipped and the battle starts straight away:
//   enemy=ogre|brute|auditor|glutton   players=3|4   seed=<number>
//   steps=<n>   play n scripted choices (always the first legal one)
//   draw=<n>    players draw n per round (to build long chains)
//   deck=wild   every player's deck is Wildcards (answers anything)
//   edraw=<n>   the enemy draws n per round (edraw=7 on a boss shows a full hand)
export const DEV_PARAMS = ["enemy", "players", "seed", "steps", "draw", "deck", "edraw"];

export function hasDevParams(query: URLSearchParams): boolean {
  return DEV_PARAMS.some((k) => query.has(k));
}

export function devSettings(query: URLSearchParams): { settings: GameSettings; seed: number } {
  const count = query.get("players") === "4" ? 4 : 3;
  return {
    settings: { names: ["Ana", "Ben", "Cy", "Dee"].slice(0, count), enemyId: query.get("enemy") ?? "ogre" },
    seed: Number(query.get("seed") ?? 1),
  };
}

export function startBattle(settings: GameSettings, seed: number, query = new URLSearchParams()): BattleState {
  const names = settings.names;
  const config = { ...content.config };
  const draw = Number(query.get("draw"));
  if (draw > 0) config.playerDrawPerRound = draw;
  const deck: DeckList = query.get("deck") === "wild" ? Array(10).fill("wildcard") : content.starterDeck;

  let state = createBattle({
    config,
    content: { dominoes, enemies: enemies.map((e) => ({ ...e, drawPerRound: Number(query.get("edraw")) || e.drawPerRound })) },
    players: names.map((id) => ({ id, deck })),
    seatOrder: [...names, "enemy"],
    startingLead: names[0],
    enemyId: settings.enemyId,
    seed,
  });
  for (let i = Number(query.get("steps") ?? 0); i > 0; i--) {
    const pending = getPendingChoice(state);
    if (!pending) break;
    state = step(
      state,
      pending.type === "opener"
        ? { type: "opener", domino: pending.dominoes[0] }
        : { type: "answer", domino: pending.options[0].domino, spark: pending.options[0].sparks[0] },
    ).state;
  }
  return state;
}
