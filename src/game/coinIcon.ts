import Phaser from "phaser";
import { artImage } from "./art";
import { FONT, button } from "./ui";
import { playSound } from "./sound";

// The one place that draws a coin amount: a gold coin icon followed by the number, never the word
// "coins". The generated ui/coin art is used when it exists, otherwise a code-drawn gold coin.
// Screen only: the amounts come from the engine and the data.

// A line is a list of parts: a string is plain text, a number is a coin amount (icon, then number).
export type CoinPart = string | number;

// Splits data text such as "You get +5 coins after every battle." into parts. A string with no
// "N coins" comes back as one string part. "costs N" counts too: the engine's refusal reasons
// ("has 3 coins, removal costs 15") use it for a price.
export function coinParts(text: string): CoinPart[] {
  const parts: CoinPart[] = [];
  let last = 0;
  for (const m of text.matchAll(/(\d+) coins?\b|(?<=\bcosts )(\d+)/g)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(Number(m[1] ?? m[2]));
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export const hasCoins = (parts: CoinPart[]): boolean => parts.some((p) => typeof p === "number");

// A gold coin centred on (x, y), `size` pixels across, added to `parent` if given.
export function drawCoin(scene: Phaser.Scene, x: number, y: number, size: number, parent?: Phaser.GameObjects.Container | null): Phaser.GameObjects.GameObject {
  const art = artImage(scene, "ui/coin", x, y, size, size, parent);
  if (art) return art;
  const r = size / 2;
  const g = scene.add.graphics();
  g.fillStyle(0xffd23f, 1);
  g.fillCircle(x, y, r);
  g.lineStyle(Math.max(1, size * 0.08), 0xb8860b, 1);
  g.strokeCircle(x, y, r - size * 0.04);
  g.lineStyle(Math.max(1, size * 0.05), 0xe0a800, 1);
  g.strokeCircle(x, y, r * 0.62);
  g.fillStyle(0xfff3a8, 0.9);
  g.fillCircle(x - r * 0.3, y - r * 0.3, r * 0.16);
  parent?.add(g);
  return g;
}

interface LineOpts {
  bold?: boolean;
  color?: string;
  origin?: number; // 0 left (default), 0.5 centred, 1 right, as for label()
}

// The parts drawn in a row, vertically centred on y. x is the left edge, centre or right edge by origin.
export function coinLine(scene: Phaser.Scene, x: number, y: number, parts: CoinPart[], size: number, opts: LineOpts = {}): Phaser.GameObjects.Container {
  const box = scene.add.container(0, y);
  const icon = Math.round(size * 1.05);
  let cx = 0;
  const text = (s: string): void => {
    const t = scene.add
      .text(cx, 0, s, { fontFamily: FONT, fontSize: `${size}px`, color: opts.color ?? "#ffffff", fontStyle: opts.bold ? "bold" : "normal" })
      .setOrigin(0, 0.5);
    box.add(t);
    cx += t.width;
  };
  for (const p of parts) {
    if (typeof p === "string") {
      text(p);
    } else {
      drawCoin(scene, cx + icon / 2, 0, icon, box);
      cx += icon + Math.round(size * 0.2);
      text(String(p));
    }
  }
  box.setSize(cx, size * 1.3);
  box.x = x - (opts.origin ?? 0) * cx;
  return box;
}

// Like button() from ui.ts, for a label that holds coin amounts.
export function coinButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  parts: CoinPart[],
  onClick: () => void,
  opts: { size?: number; selected?: boolean; disabled?: boolean; origin?: number } = {},
): Phaser.GameObjects.GameObject {
  if (!hasCoins(parts)) return button(scene, x, y, parts.join(""), onClick, opts);
  const size = opts.size ?? 30;
  const line = coinLine(scene, 0, 0, parts, size, { bold: true });
  const w = line.width + 40;
  const h = Math.round(size * 1.3) + 20;
  const bg = scene.add.rectangle(0, 0, w, h, opts.selected ? 0xb8860b : 0x0d2a20).setOrigin(0, 0.5);
  line.x = 20;
  const c = scene.add.container(x - (opts.origin ?? 0) * w, y, [bg, line]);
  c.setSize(w, h);
  if (opts.disabled) c.setAlpha(0.4);
  else {
    bg.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      playSound("click");
      onClick();
    });
  }
  return c;
}
