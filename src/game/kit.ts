import Phaser from "phaser";
import presentation from "../../data/presentation.json";
import { roleStyle, snap, tabularDigits, type Role } from "./fonts";
import { playSound } from "./sound";
import { hexColour } from "./presentation";

// The interface kit (#301, T7): plates, bars, buttons, placement pips and the Ready tick, drawn
// in code in whole grid pixels (one grid pixel is `unit` screen pixels, T6). No image files;
// every size and colour is in data/presentation.json ("kit"). Sizes passed in are grid pixels.

const K = presentation.kit;
const U = K.unit;

type Gfx = Phaser.GameObjects.Graphics;

// A filled rectangle with its four corners cut by `cut` grid pixels (a stepped corner).
function cutRect(g: Gfx, x: number, y: number, w: number, h: number, cut: number): void {
  const c = Math.max(0, Math.min(cut, Math.floor(Math.min(w, h) / 2)));
  g.fillRect(x + c * U, y, (w - 2 * c) * U, h * U);
  if (c > 0) g.fillRect(x, y + c * U, w * U, (h - 2 * c) * U);
}

// A plate: dark outline, a lighter inner edge, a dark fill, cut corners. (x, y) is the top left
// in screen pixels (snapped to the grid); w and h are in grid pixels. `edge` overrides the edge colour.
export function drawPlate(g: Gfx, x: number, y: number, w: number, h: number, edge?: string): void {
  const P = K.plate;
  const sx = Math.round(x / U) * U;
  const sy = Math.round(y / U) * U;
  g.fillStyle(hexColour(P.outline), 1);
  cutRect(g, sx, sy, w, h, P.cut);
  g.fillStyle(hexColour(edge ?? P.edge), 1);
  cutRect(g, sx + U, sy + U, w - 2, h - 2, P.cut - 1);
  g.fillStyle(hexColour(P.fill), 1);
  cutRect(g, sx + 2 * U, sy + 2 * U, w - 4, h - 4, P.cut - 2);
}

export type BarKind = keyof typeof K.bar.kinds;

export interface BarState {
  value: number;
  pale?: number; // the "about to change" part: the bar's value after the change, shown in pale where it differs from `value`
  number?: string; // centred on the bar; its digits keep fixed cells
}

export interface BarOpts extends BarState {
  kind: BarKind;
  max: number;
}

export interface Bar extends Phaser.GameObjects.Container {
  // Changes the fill, the pale part and the number in place (the bar is repainted, not rebuilt).
  setBar(state: BarState): void;
}

// A bar: dark track, a fill with a light top row and a dark bottom row, an optional pale part
// and an optional centred number with a dark outline. (x, y) is the top left in screen pixels,
// w in grid pixels. Call setBar to change it.
export function drawBar(scene: Phaser.Scene, x: number, y: number, w: number, o: BarOpts): Bar {
  const B = K.bar;
  const kind = B.kinds[o.kind];
  const h = B.height;
  const sx = Math.round(x / U) * U;
  const sy = Math.round(y / U) * U;
  const g = scene.add.graphics();
  const box = scene.add.container(0, 0, [g]) as Bar;
  const inner = w - 2;
  const cells = (v: number): number => Math.max(0, Math.min(inner, Math.round((v / Math.max(1, o.max)) * inner)));
  const rows = (from: number, to: number, body: string, top: string, bottom: string): void => {
    if (to <= from) return;
    const bx = sx + U + from * U;
    const bw = (to - from) * U;
    g.fillStyle(hexColour(body), 1);
    g.fillRect(bx, sy + U, bw, (h - 2) * U);
    g.fillStyle(hexColour(top), 1);
    g.fillRect(bx, sy + U, bw, U);
    g.fillStyle(hexColour(bottom), 1);
    g.fillRect(bx, sy + (h - 2) * U, bw, U);
  };
  let num: Phaser.GameObjects.Text | undefined;
  box.setBar = (st: BarState): void => {
    g.clear();
    g.fillStyle(hexColour(B.outline), 1);
    cutRect(g, sx, sy, w, h, 1);
    g.fillStyle(hexColour(B.track), 1);
    g.fillRect(sx + U, sy + U, (w - 2) * U, (h - 2) * U);
    const fill = cells(st.value);
    rows(0, fill, kind.fill, kind.top, kind.bottom);
    if (st.pale !== undefined) {
      const to = cells(st.pale);
      // Pale where the bar is about to lose (value above pale) or gain (pale above value).
      rows(Math.min(fill, to), Math.max(fill, to), B.pale, B.pale, B.pale);
    }
    if (st.number === undefined) {
      num?.destroy();
      num = undefined;
      return;
    }
    if (!num) {
      num = tabularDigits(scene.add.text(0, 0, "", { ...roleStyle(B.numberRole as Role), color: B.numberColour, stroke: B.numberOutline, strokeThickness: B.numberOutlineWidth }).setOrigin(0.5));
      box.add(num);
    }
    num.setText(st.number);
    num.setPosition(sx + (w * U) / 2, sy + (h * U) / 2);
    snap(num);
  };
  box.setBar(o);
  return box;
}

export type ButtonState = "raised" | "pressed" | "disabled";

function drawButtonFace(g: Gfx, w: number, h: number, state: ButtonState): void {
  const B = K.button;
  const s = B[state];
  const down = state === "pressed" ? B.press * U : 0;
  g.clear();
  g.fillStyle(hexColour(B.outline), 1);
  cutRect(g, 0, down, w, h, B.cut);
  g.fillStyle(hexColour(s.shade), 1);
  cutRect(g, U, U + down, w - 2, h - 2, B.cut - 1);
  g.fillStyle(hexColour(s.face), 1);
  cutRect(g, U, U + down, w - 2, h - 3, B.cut - 1);
  g.fillStyle(hexColour(s.light), 1);
  g.fillRect(U * (B.cut), U + down, (w - 2 * B.cut) * U, U);
}

export interface KitButton extends Phaser.GameObjects.Container {
  setButtonState(state: ButtonState): void;
}

// A button centred on (x, y): raised, pressed (while the pointer is down) and disabled.
// `width` is in grid pixels; the default fits the label.
export function kitButton(scene: Phaser.Scene, x: number, y: number, text: string, onClick: () => void, opts: { disabled?: boolean; width?: number } = {}): KitButton {
  const B = K.button;
  const label = scene.add.text(0, 0, text, { ...roleStyle(B.textRole as Role), color: B.raised.text }).setOrigin(0.5);
  const w = opts.width ?? Math.ceil(label.width / U) + 2 * B.padX;
  const h = B.height;
  const g = scene.add.graphics();
  const box = scene.add.container(Math.round((x - (w * U) / 2) / U) * U, Math.round((y - (h * U) / 2) / U) * U, [g, label]) as KitButton;
  label.setPosition(Math.round((w * U) / 2), Math.round((h * U) / 2));
  const set = (state: ButtonState): void => {
    drawButtonFace(g, w, h, state);
    label.setColor(B[state].text);
    label.y = Math.round((h * U) / 2) + (state === "pressed" ? B.press * U : 0);
  };
  box.setButtonState = set;
  set(opts.disabled ? "disabled" : "raised");
  if (!opts.disabled) {
    // A Container's own hit area is measured from its centre in Phaser, so a clear rectangle the size of the button takes the pointer.
    const hit = scene.add.rectangle((w * U) / 2, (h * U) / 2, w * U, h * U, 0x000000, 0).setInteractive({ useHandCursor: true });
    box.add(hit);
    hit.on("pointerdown", () => set("pressed"));
    hit.on("pointerup", () => {
      set("raised");
      playSound("click");
      onClick();
    });
    hit.on("pointerout", () => set("raised"));
  }
  return box;
}

// Placement pips: `left` bright ones, then `spent` dim ones, in a row from (x, y) (top left, screen pixels).
export function drawPips(g: Gfx, x: number, y: number, left: number, spent: number): void {
  const P = K.pips;
  for (let i = 0; i < left + spent; i++) {
    const px = Math.round(x / U) * U + i * (P.size + P.gap) * U;
    const py = Math.round(y / U) * U;
    const on = i < left;
    g.fillStyle(hexColour(P.outline), 1);
    g.fillRect(px, py, P.size * U, P.size * U);
    const inner = (P.size - 2) * U;
    g.fillStyle(hexColour(on ? P.left : P.spentEdge), 1);
    g.fillRect(px + U, py + U, inner, inner);
    if (on) {
      g.fillStyle(hexColour(P.leftLight), 1);
      g.fillRect(px + U, py + U, inner, U);
    } else {
      g.fillStyle(hexColour(P.spent), 1);
      g.fillRect(px + 2 * U, py + 2 * U, inner - 2 * U, inner - 2 * U);
    }
  }
}

// The Ready tick, its top left at (x, y) in screen pixels.
export function drawTick(g: Gfx, x: number, y: number): void {
  const T = K.tick;
  const px = Math.round(x / U) * U;
  const py = Math.round(y / U) * U;
  const on = (r: number, c: number): boolean => T.rows[r]?.[c] === "X";
  g.fillStyle(hexColour(T.outline), 1);
  for (let r = -1; r <= T.rows.length; r++) {
    for (let c = -1; c <= T.rows[0].length; c++) {
      if (!on(r, c) && (on(r - 1, c) || on(r + 1, c) || on(r, c - 1) || on(r, c + 1))) g.fillRect(px + c * U, py + r * U, U, U);
    }
  }
  g.fillStyle(hexColour(T.colour), 1);
  for (let r = 0; r < T.rows.length; r++) for (let c = 0; c < T.rows[r].length; c++) if (on(r, c)) g.fillRect(px + c * U, py + r * U, U, U);
}
