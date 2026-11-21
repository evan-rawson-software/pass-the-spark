import Phaser from "phaser";
import { artBackground } from "./art";
import { playSound } from "./sound";

// Small helpers for the placeholder online screens (menu, lobby, join).

export const FONT = "Arial, Helvetica, sans-serif";
export const INPUT_STYLE =
  "width:300px;height:44px;font:28px Arial,Helvetica,sans-serif;padding:0 12px;box-sizing:border-box;border-radius:8px;border:2px solid #2f7a5b;background:#f4ecd8;color:#222";

// `art` names backgrounds/<art>, drawn over the plain fill when it exists.
export function drawBackground(scene: Phaser.Scene, art?: string): void {
  const g = scene.add.graphics();
  g.fillStyle(0x1e5a42, 1);
  g.fillRect(0, 0, 1920, 1080);
  if (art) artBackground(scene, art);
}

export function label(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  size: number,
  opts: { bold?: boolean; color?: string; origin?: number } = {},
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color: opts.color ?? "#ffffff", fontStyle: opts.bold ? "bold" : "normal" })
    .setOrigin(opts.origin ?? 0, 0.5);
}

export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  s: string,
  onClick: () => void,
  opts: { size?: number; selected?: boolean; disabled?: boolean; origin?: number } = {},
): Phaser.GameObjects.Text {
  const t = label(scene, x, y, s, opts.size ?? 30, { bold: true, origin: opts.origin });
  t.setPadding(20, 10).setBackgroundColor(opts.selected ? "#b8860b" : "#0d2a20");
  if (opts.disabled) t.setAlpha(0.4);
  else t.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
      playSound("click");
      onClick();
    });
  return t;
}

export function textInput(scene: Phaser.Scene, x: number, y: number, value: string, maxLength: number): Phaser.GameObjects.DOMElement {
  const el = scene.add.dom(x, y, "input", INPUT_STYLE);
  const input = el.node as HTMLInputElement;
  input.type = "text";
  input.maxLength = maxLength;
  input.value = value;
  return el;
}

// The player's name is remembered in this browser. Storage can be unavailable.
export function savedName(): string {
  try {
    return window.localStorage.getItem("pass-the-spark-name") ?? "";
  } catch {
    return "";
  }
}

export function saveName(name: string): void {
  try {
    window.localStorage.setItem("pass-the-spark-name", name);
  } catch {
    // storage unavailable
  }
}
