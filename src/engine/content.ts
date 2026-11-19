// Loads the files in data/. Bad data throws, so the game fails loudly.

import type { Config, DeckList, Domino, Enemy } from "./types";
import { validateConfig, validateDominoes, validateEnemies, validateStarterDeck } from "./validate";

export interface Content {
  config: Config;
  dominoes: Domino[];
  enemies: Enemy[];
  starterDeck: DeckList;
}

export function loadContent(raw: { config: unknown; dominoes: unknown; enemies: unknown; starterDeck: unknown }): Content {
  const dominoes = validateDominoes(raw.dominoes);
  return {
    config: validateConfig(raw.config),
    dominoes,
    enemies: validateEnemies(raw.enemies, dominoes),
    starterDeck: validateStarterDeck(raw.starterDeck, dominoes),
  };
}
