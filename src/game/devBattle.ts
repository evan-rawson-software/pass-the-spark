import { createBattle, getPendingChoice, step } from "../engine/battle";
import type { BattleState } from "../engine/battle";
import { loadContent } from "../engine/content";
import type { DeckList } from "../engine/types";

// Validates all of data/ once, at load; bad content throws here.
export const content = loadContent();
export const dominoes = content.dominoes;
export const enemies = content.enemies;

// What the start screen collects. Seat order is names in order; the first name leads.
export interface GameSettings {
  names: string[]; // 2 to 4 player names
  enemyId: string;
}

// Kept so "Back to start" shows the settings of the last game.
export let lastSettings: GameSettings | null = null;
export function rememberSettings(settings: GameSettings): void {
  lastSettings = settings;
}

// Dev query params (all optional). When the page is opened with any of them the
// start screen is skipped and the battle starts straight away:
//   enemy=ogre|brute|warden|auditor|glutton   players=2|3|4   seed=<number>
//   steps=<n>   play n scripted choices (always the first legal play, on its first end)
//   draw=<n>    players draw n per round
export const DEV_PARAMS = ["enemy", "players", "seed", "steps", "draw"];

export function hasDevParams(query: URLSearchParams): boolean {
  return DEV_PARAMS.some((k) => query.has(k));
}

export function devSettings(query: URLSearchParams): { settings: GameSettings; seed: number } {
  const players = Number(query.get("players"));
  const count = players === 2 || players === 4 ? players : 3;
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
  const deck: DeckList = content.starterDeck;

  let state = createBattle({
    config,
    content: { dominoes, enemies },
    players: names.map((id) => ({ id, deck })),
    seatOrder: names,
    startingLead: names[0],
    enemyId: settings.enemyId,
    seed,
  });
  for (let i = Number(query.get("steps") ?? 0); i > 0; i--) {
    const pending = getPendingChoice(state);
    if (!pending) break;
    const play = pending.plays[0];
    if (!play) break;
    state = step(state, { type: "play", domino: play.domino, end: pending.opener ? undefined : play.ends[0] }).state;
  }
  return state;
}
