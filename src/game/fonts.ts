import type Phaser from "phaser";
import presentation from "../../data/presentation.json";

// The pixel fonts and the text roles (#301, S6, T6). Roles live in data/presentation.json.
// Dominoes keep their own font (S7) and do not use this.

const T = presentation.text;
const ROLES = T.roles as Record<string, { family: string; size: number }>;

export type Role = "label" | "text" | "title" | "huge";

// The CSS family list for a family name: the font, then a plain fallback.
const stack = (family: string): string => `"${family}", ${T.fallback}`;

// The text style fields (family and size) of a named role.
export function roleStyle(role: Role): { fontFamily: string; fontSize: string } {
  const r = ROLES[role];
  return { fontFamily: stack(r.family), fontSize: `${r.size}px` };
}

// The role whose size is nearest to `size`; a tie goes to the smaller one.
export function nearestRole(size: number): Role {
  let best: Role = "label";
  for (const name of Object.keys(ROLES) as Role[]) {
    const d = Math.abs(ROLES[name].size - size);
    const bd = Math.abs(ROLES[best].size - size);
    if (d < bd || (d === bd && ROLES[name].size < ROLES[best].size)) best = name;
  }
  return best;
}

// Style fields for a screen that asks for `size`: the nearest role's font and size.
export function fontRole(size: number): { fontFamily: string; fontSize: string } {
  return roleStyle(nearestRole(size));
}

// The font of typed inputs, which are page elements, as a CSS `font` value.
export function inputFont(): string {
  return `${T.inputSize}px ${stack(ROLES.text.family)}`;
}

// Loads every font file and adds it to the page. Resolves when all are ready (or have failed:
// a missing file falls back and the game still starts). Call before the first scene draws.
export async function loadFonts(): Promise<void> {
  const base = import.meta.env.BASE_URL;
  await Promise.all(
    T.fonts.map(async (f) => {
      try {
        const face = new FontFace(f.family, `url(${base}${f.file})`);
        document.fonts.add(await face.load());
      } catch {
        // fall back to the plain font
      }
    }),
  );
}

// Counting numbers must not shift sideways as digits change. Jersey's digits are different
// widths ("1" is narrow), so this makes a Text object lay out every digit in a cell as wide as
// the font's widest digit, at whatever size the text currently has. Other characters keep
// their own width. Call once after creating the Text; setText, setFontSize etc. keep working.
export function tabularDigits(text: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  const ctx = text.context;
  const measure = ctx.measureText.bind(ctx);
  const fill = ctx.fillText.bind(ctx);
  const stroke = ctx.strokeText.bind(ctx);
  const cell = (): number => {
    let w = 0;
    for (let d = 0; d < 10; d++) w = Math.max(w, measure(String(d)).width);
    return w;
  };
  const advance = (ch: string, c: number): number => (ch >= "0" && ch <= "9" ? c : measure(ch).width);
  const width = (s: string): number => {
    const c = cell();
    let w = 0;
    for (const ch of s) w += advance(ch, c);
    return w;
  };
  const draw = (paint: (s: string, x: number, y: number) => void) => (s: string, x: number, y: number): void => {
    if (!/\d/.test(s)) return paint(s, x, y);
    const c = cell();
    let at = x;
    for (const ch of s) {
      const a = advance(ch, c);
      const dx = ch >= "0" && ch <= "9" ? (c - measure(ch).width) / 2 : 0; // a digit sits centred in its cell
      paint(ch, Math.round(at + dx), y);
      at += a;
    }
  };
  ctx.measureText = (s: string): TextMetrics => {
    const m = measure(s);
    if (!/\d/.test(s)) return m;
    return { width: width(s), actualBoundingBoxAscent: m.actualBoundingBoxAscent, actualBoundingBoxDescent: m.actualBoundingBoxDescent, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width(s), fontBoundingBoxAscent: m.fontBoundingBoxAscent, fontBoundingBoxDescent: m.fontBoundingBoxDescent } as TextMetrics;
  };
  ctx.fillText = draw(fill);
  ctx.strokeText = draw(stroke);
  text.updateText();
  return text;
}
