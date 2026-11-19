// Loads the files in data/. Bad data throws, so the game fails loudly.

import configJson from "../../data/config.json";
import dominoesJson from "../../data/dominoes.json";
import enemiesJson from "../../data/enemies.json";
import starterDeckJson from "../../data/starter-deck.json";
import type { Config, DeckList, Domino, Enemy } from "./types";
import { validateConfig, validateDominoes, validateEnemies, validateStarterDeck } from "./validate";

export interface Content {
  config: Config;
  dominoes: Domino[];
  enemies: Enemy[];
  starterDeck: DeckList;
}

export function loadContent(): Content {
  const dominoes = validateDominoes(dominoesJson);
  return {
    config: validateConfig(configJson),
    dominoes,
    enemies: validateEnemies(enemiesJson, dominoes),
    starterDeck: validateStarterDeck(starterDeckJson, dominoes),
  };
}
