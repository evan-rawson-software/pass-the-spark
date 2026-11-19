import { createBattle, getPendingChoice, step } from "../engine/battle";
import type { BattleState } from "../engine/battle";
import { loadContent } from "../engine/content";
import type { DeckList } from "../engine/types";
import configJson from "../../data/config.json";
import dominoesJson from "../../data/dominoes.json";
import enemiesJson from "../../data/enemies.json";
import starterDeckJson from "../../data/starter-deck.json";

// The placeholder battle the combat table shows until the start screen (#27)
// exists. #27 replaces startPlaceholderBattle with the real setup.
// Dev query params, all optional:
//   enemy=ogre|brute|auditor|glutton   players=3|4   seed=<number>
//   steps=<n>   play n scripted choices (always the first legal one)
//   draw=<n>    players draw n per round (to build long chains)
//   deck=wild   every player's deck is Wildcards (answers anything)
//   edraw=<n>   the enemy draws n per round (edraw=7 on a boss shows a full hand)
// Validates all of data/ once, at load; bad content throws here.
const content = loadContent({ config: configJson, dominoes: dominoesJson, enemies: enemiesJson, starterDeck: starterDeckJson });
export const dominoes = content.dominoes;
export const enemies = content.enemies;
const PLAYER_NAMES = ["Ana", "Ben", "Cy", "Dee"];

export function startPlaceholderBattle(query: URLSearchParams): BattleState {
  const playerCount = query.get("players") === "4" ? 4 : 3;
  const names = PLAYER_NAMES.slice(0, playerCount);
  const config = { ...content.config };
  const draw = Number(query.get("draw"));
  if (draw > 0) config.playerDrawPerRound = draw;
  const deck: DeckList = query.get("deck") === "wild" ? Array(10).fill("wildcard") : content.starterDeck;

  let state = createBattle({
    config,
    content: { dominoes, enemies: enemies.map((e) => ({ ...e, drawPerRound: Number(query.get("edraw")) || e.drawPerRound })) },
    players: names.map((id) => ({ id, deck })),
    seatOrder: [...names, "enemy"],
    enemyId: query.get("enemy") ?? "ogre",
    seed: Number(query.get("seed") ?? 1),
  });
  for (let i = Number(query.get("steps") ?? 0); i > 0; i--) {
    const pending = getPendingChoice(state);
    if (!pending) break;
    state = step(
      state,
      pending.type === "fuse"
        ? { type: "fuse", domino: pending.dominoes[0] }
        : { type: "answer", domino: pending.options[0].domino, spark: pending.options[0].sparks[0] },
    ).state;
  }
  return state;
}
