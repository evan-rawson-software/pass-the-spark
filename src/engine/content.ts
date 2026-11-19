// Loads the files in data/. Bad data throws, so the game fails loudly.

import charmsJson from "../../data/charms.json";
import configJson from "../../data/config.json";
import dominoesJson from "../../data/dominoes.json";
import enemiesJson from "../../data/enemies.json";
import eventsJson from "../../data/events.json";
import poolsJson from "../../data/domino-pools.json";
import runJson from "../../data/run.json";
import starterDeckJson from "../../data/starter-deck.json";
import type { Charm, Config, DeckList, Domino, Enemy, EventData, Pools, RunData } from "./types";
import { validateConfig, validateDominoes, validateEnemies, validatePools, validateStarterDeck } from "./validate";
import { validateCharms } from "./validate-charms";
import { validateEvents } from "./validate-events";
import { validateRun } from "./validate-run";

export interface Content {
  config: Config;
  charms: Charm[];
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
  const pools = validatePools(poolsJson);
  return {
    config: validateConfig(configJson),
    charms: validateCharms(charmsJson),
    dominoes,
    enemies,
    starterDeck: validateStarterDeck(starterDeckJson, dominoes),
    pools,
    run: validateRun(runJson, enemies),
    events: validateEvents(eventsJson, pools),
  };
}
