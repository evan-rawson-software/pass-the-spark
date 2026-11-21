import { expect, test } from "vitest";
import { loadContent } from "../src/engine/content";
import { generateDomino } from "../src/engine/generate";
import { validateDominoes } from "../src/engine/validate";
import type { Rarity } from "../src/engine/types";

test("generated dominoes pass validation and respect the pool rules", () => {
  const { pools } = loadContent();
  const basic = ["Ember", "Tide", "Gale"];
  const advanced = ["Storm", "Void"];
  let uncommonAdvancedOutputs = 0;
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
      if (rarity === "rare") {
        expect(d.intake === "any" || advanced.includes(d.intake[0])).toBe(true);
        expect(d.output.every((s) => basic.includes(s))).toBe(true);
        expect(d.kind).not.toBe("junction");
      } else {
        expect(basic).toContain((d.intake as string[])[0]);
      }
      if (rarity === "common") {
        expect(d.output.every((s) => basic.includes(s))).toBe(true);
        expect(d.kind).not.toBe("junction");
        expect(d.amp ?? d.effect).toSatisfy((x: { op?: string; kind?: string; ignoresBlock?: boolean }) => x.op === "add" || ["damage", "block"].includes(x.kind as string));
        expect(d.effect?.ignoresBlock ?? false).toBe(false);
      }
      if (rarity === "uncommon") {
        expect(d.output.every((s) => basic.includes(s) || advanced.includes(s))).toBe(true);
        if (d.output.some((s) => advanced.includes(s))) uncommonAdvancedOutputs++;
      }
      if (d.kind === "junction") expect(d.output[0]).not.toBe(d.output[1]);
    }
  }
  expect(uncommonAdvancedOutputs).toBeGreaterThan(0);
});

test("a player with no unlocks is never offered a locked amplifier, cap, trait or spark", () => {
  const { pools, progression } = loadContent();
  const everything = progression.levels.map((l) => l.unlock);
  const basic = ["Ember", "Tide", "Gale"];
  let state = 99;
  for (const rarity of ["common", "uncommon", "rare"] as Rarity[]) {
    for (let i = 0; i < 300; i++) {
      const r = generateDomino(state, rarity, pools, i, []);
      state = r.state;
      const d = r.value;
      if (d.amp) expect(d.amp).toEqual({ op: "add", value: 1 }); // Boost +1 only
      if (d.effect) expect(["damage", "block"]).toContain(d.effect.kind);
      expect(d.effect?.ignoresBlock ?? false).toBe(false);
      expect(d.intake !== "any" && d.intake.every((s) => basic.includes(s))).toBe(true);
      expect(d.output.every((s) => basic.includes(s))).toBe(true);
      expect(d.rarity).toBe(rarity === "rare" ? "uncommon" : rarity); // a rare slot falls back to uncommon
      if (d.rarity === "uncommon") expect(d.kind).not.toBe("amplifier"); // Boost +2 and Echo are locked
    }
  }
  // With everything unlocked the draw is exactly the same as with no gating.
  expect(generateDomino(7, "rare", pools, 1, everything)).toEqual(generateDomino(7, "rare", pools, 1, null));
  expect(generateDomino(8, "uncommon", pools, 1, everything)).toEqual(generateDomino(8, "uncommon", pools, 1, null));
});
