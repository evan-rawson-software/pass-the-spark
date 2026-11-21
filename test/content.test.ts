import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";

test("every file in data/ passes validation", () => {
  expect(() => loadContent()).not.toThrow();
});
