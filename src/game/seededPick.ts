// A seeded pick (Z2): a whole number from 0 to count - 1, worked out from values every screen
// already shares (the enemy's id, the round, a board node's id, the seat). The same values always give
// the same pick, so every screen shows the same one. No Math.random, and the engine is not involved:
// the arcane circle's variant per cascade uses it (#264), and the casts will (#265).
export function seededPick(count: number, ...parts: (string | number)[]): number {
  if (count <= 1) return 0;
  // FNV-1a over the parts, then a final mix so near values spread out.
  let h = 0x811c9dc5;
  for (const c of parts.join("|")) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) % count;
}
