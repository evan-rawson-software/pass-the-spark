import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import config from "../data/config.json";
import dominoes from "../data/dominoes.json";
import enemies from "../data/enemies.json";
import starterDeck from "../data/starter-deck.json";

test("every file in data/ passes validation", () => {
  expect(() => loadContent({ config, dominoes, enemies, starterDeck })).not.toThrow();
});
