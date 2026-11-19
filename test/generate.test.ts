import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import { generateDomino } from "../src/engine/generate";
import { validateDominoes } from "../src/engine/validate";
import type { Rarity } from "../src/engine/types";

test("generated dominoes pass validation and respect the pool rules", () => {
  const { pools } = loadContent();
  const basic = ["Ember", "Tide", "Gale"];
  let state = 12345;
  let index = 0;
  for (const rarity of ["common", "uncommon", "rare"] as Rarity[]) {
    for (let i = 0; i < 500; i++) {
      const r = generateDomino(state, rarity, pools, index++);
      state = r.state;
      const d = r.value;
      expect(() => validateDominoes([d], "generated")).not.toThrow();
      expect(d.rarity).toBe(rarity);
      if (d.intake !== "any") expect(d.intake.length).toBe(1);
      expect(["heal", "reflect"]).not.toContain(d.effect.kind);
      if (rarity !== "rare") {
        const sparks = [...(d.intake === "any" ? ["any"] : d.intake), ...d.output];
        expect(sparks.every((s) => basic.includes(s))).toBe(true);
        expect(d.effect.kind).not.toBe("mimic");
      }
      if (rarity === "common") {
        expect(d.output.length).toBe(1);
        expect(d.effect.spectrum ?? false).toBe(false);
        expect(d.effect.ignoresBlock ?? false).toBe(false);
      }
    }
  }
});
