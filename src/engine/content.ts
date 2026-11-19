// Loads the files in data/. Bad data throws, so the game fails loudly.

import configJson from "../../data/config.json";
import dominoesJson from "../../data/dominoes.json";
import enemiesJson from "../../data/enemies.json";
import poolsJson from "../../data/domino-pools.json";
import starterDeckJson from "../../data/starter-deck.json";
import type { Config, DeckList, Domino, Enemy, Pools } from "./types";
import { validateConfig, validateDominoes, validateEnemies, validatePools, validateStarterDeck } from "./validate";

export interface Content {
  config: Config;
  dominoes: Domino[];
  enemies: Enemy[];
  starterDeck: DeckList;
  pools: Pools;
}

export function loadContent(): Content {
  const dominoes = validateDominoes(dominoesJson);
  return {
    config: validateConfig(configJson),
    dominoes,
    enemies: validateEnemies(enemiesJson, dominoes),
    starterDeck: validateStarterDeck(starterDeckJson, dominoes),
    pools: validatePools(poolsJson),
  };
}
