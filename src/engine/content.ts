// Loads the files in data/. Bad data throws, so the game fails loudly.

import configJson from "../../data/config.json";
import dominoesJson from "../../data/dominoes.json";
import enemiesJson from "../../data/enemies.json";
import eventsJson from "../../data/events.json";
import poolsJson from "../../data/domino-pools.json";
import runJson from "../../data/run.json";
import starterDeckJson from "../../data/starter-deck.json";
import type { Config, DeckList, Domino, Enemy, EventData, Pools, RunData } from "./types";
import { validateConfig, validateDominoes, validateEnemies, validatePools, validateStarterDeck } from "./validate";
import { validateEvents } from "./validate-events";
import { validateRun } from "./validate-run";

export interface Content {
  config: Config;
  dominoes: Domino[];
  enemies: Enemy[];
  starterDeck: DeckList;
  pools: Pools;
  run: RunData;
  events: EventData[];
}

export function loadContent(): Content {
  const dominoes = validateDominoes(dominoesJson);
  const enemies = validateEnemies(enemiesJson, dominoes);
  return {
    config: validateConfig(configJson),
    dominoes,
    enemies,
    starterDeck: validateStarterDeck(starterDeckJson, dominoes),
    pools: validatePools(poolsJson),
    run: validateRun(runJson, enemies),
    events: validateEvents(eventsJson),
  };
}
