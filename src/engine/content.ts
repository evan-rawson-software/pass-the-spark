// Loads the files in data/. Bad data throws, so the game fails loudly.

import charmsJson from "../../data/charms.json";
import configJson from "../../data/config.json";
import dominoesJson from "../../data/dominoes.json";
import enemyDominoesJson from "../../data/enemy-dominoes.json";
import enemiesJson from "../../data/enemies.json";
import eventsJson from "../../data/events.json";
import poolsJson from "../../data/domino-pools.json";
import progressionJson from "../../data/progression.json";
import runJson from "../../data/run.json";
import starterDeckJson from "../../data/starter-deck.json";
import type { Charm, Config, DeckList, Domino, Enemy, EnemyDomino, EventData, Pools, ProgressionData, RunData } from "./types";
import { validateConfig, validateDominoes, validateEnemies, validateEnemyDominoes, validatePools, validateStarterDeck } from "./validate";
import { validateCharms } from "./validate-charms";
import { validateEvents } from "./validate-events";
import { validateProgression } from "./validate-progression";
import { validateRun } from "./validate-run";

export interface Content {
  config: Config;
  charms: Charm[];
  dominoes: Domino[];
  enemyDominoes: EnemyDomino[]; // temporary, until #182
  enemies: Enemy[];
  starterDeck: DeckList;
  pools: Pools;
  run: RunData;
  events: EventData[];
  progression: ProgressionData;
}

export function loadContent(): Content {
  const dominoes = validateDominoes(dominoesJson);
  const enemyDominoes = validateEnemyDominoes(enemyDominoesJson);
  const enemies = validateEnemies(enemiesJson, enemyDominoes);
  const pools = validatePools(poolsJson);
  return {
    config: validateConfig(configJson),
    charms: validateCharms(charmsJson),
    dominoes,
    enemyDominoes,
    enemies,
    starterDeck: validateStarterDeck(starterDeckJson, dominoes),
    pools,
    run: validateRun(runJson, enemies),
    events: validateEvents(eventsJson, pools),
    progression: validateProgression(progressionJson),
  };
}
