import Phaser from "phaser";
import type { PlayPreview } from "../engine/battle";
import type { Domino } from "../engine/types";
import { coinLine, coinParts, hasCoins } from "./coinIcon";
import { fontRole } from "./fonts";

// Domino tooltips. No rules here: it formats the domino's static data and, for a
// playable domino in the active hand, the numbers previewPlay returns.

const WIDTH = 440;
const PAD = 16;
const SCREEN = { w: 1920, h: 1080 };

const KIND_NAME = { amplifier: "Amplifier", junction: "Junction", cap: "Cap" };
const EFFECT_NAME = { damage: "Damage", block: "Block" };

function effectText(d: Domino): string {
  if (d.kind === "junction") return "Splits the path: both branches carry the full charge";
  if (d.kind === "cap" && d.effect) return `${EFFECT_NAME[d.effect.kind]} ${d.effect.base} × charge`;
  if (!d.amp) return "";
  const v = d.amp.value;
  if (d.amp.op === "add") return `Boost: charge +${v}`;
  if (d.amp.op === "mul") return `Double: charge ×${v}`;
  if (d.amp.op === "echo") return `Echo: caps further along go off ${v} more time${v === 1 ? "" : "s"}`;
  return `Spectrum: charge +${v} per different spark on the path`;
}

export interface TipLine {
  text: string;
  style?: "title" | "head" | "dim";
}

// One "if played now" result: where (the end's spark, or the opener) and what previewPlay says.
export interface TipPreview {
  where: string;
  preview: PlayPreview;
}

function previewText(domino: Domino, p: PlayPreview): string {
  if (domino.kind !== "cap" || !domino.effect) return `charge becomes ${p.charge}`;
  const times = p.triggers > 1 ? ` × ${p.triggers}` : "";
  return `${EFFECT_NAME[domino.effect.kind]} ${p.value}${times} (charge ${p.charge})`;
}

// Everything the tooltip says. `previews` are previewPlay's results for a playable domino
// in the active hand, or undefined.
export function tipLines(domino: Domino, previews?: TipPreview[]): TipLine[] {
  const lines: TipLine[] = [{ text: domino.name, style: "title" }];
  lines.push({ text: KIND_NAME[domino.kind], style: "dim" });
  lines.push({ text: `Intake: ${domino.intake === "any" ? "any spark" : domino.intake.join(" or ")}` });
  lines.push({ text: effectText(domino) });
  if (domino.output.length > 0) lines.push({ text: `Output: ${domino.output.join(" and ")}` });
  if (domino.effect?.ignoresBlock) lines.push({ text: "Ignores block", style: "dim" });
  if (domino.upgraded && domino.upgraded.length > 0) {
    lines.push({ text: `Upgraded: ${domino.upgraded.length > 1 ? "both" : domino.upgraded[0]}`, style: "dim" });
  }
  if (previews && previews.length > 0) {
    lines.push({ text: "If played now", style: "head" });
    const seen = new Set<string>();
    for (const { where, preview } of previews) {
      const text = `${where}: ${previewText(domino, preview)}`;
      if (!seen.has(text)) lines.push({ text });
      seen.add(text);
    }
  }
  return lines;
}

// One tooltip for the scene. attach() makes a game object show it on hover; the previews
// are computed only when the pointer arrives.
export class Tooltip {
  private box?: Phaser.GameObjects.Container;
  avoid?: { x: number; y: number; w: number; h: number }; // a screen area the tooltip must not cover (the combat buttons)

  constructor(private scene: Phaser.Scene) {}

  attach(target: Phaser.GameObjects.Container, domino: Domino, previews?: () => TipPreview[]): void {
    target.setInteractive();
    target.on("pointerover", (pointer: Phaser.Input.Pointer) => this.show(tipLines(domino, previews?.()), pointer));
    target.on("pointermove", (pointer: Phaser.Input.Pointer) => this.move(pointer));
    target.on("pointerout", () => this.hide());
    target.on("destroy", () => this.hide());
  }

  // A tooltip of plain lines on any object (the map's boss).
  attachLines(target: Phaser.GameObjects.GameObject, lines: TipLine[]): void {
    target.setInteractive();
    target.on("pointerover", (pointer: Phaser.Input.Pointer) => this.show(lines, pointer));
    target.on("pointermove", (pointer: Phaser.Input.Pointer) => this.move(pointer));
    target.on("pointerout", () => this.hide());
    target.on("destroy", () => this.hide());
  }

  hide(): void {
    this.box?.destroy(true);
    this.box = undefined;
  }

  private show(lines: TipLine[], pointer: Phaser.Input.Pointer): void {
    this.hide();
    const box = this.scene.add.container(0, 0).setDepth(1000);
    const bg = this.scene.add.graphics();
    box.add(bg);
    let y = PAD;
    for (const line of lines) {
      const size = line.style === "title" ? 48 : 24;
      const color = line.style === "head" ? "#ffe14d" : line.style === "dim" ? "#9fd1b8" : "#ffffff";
      const gap = line.style === "head" ? 10 : 0;
      const parts = coinParts(line.text);
      if (hasCoins(parts)) {
        // Data text with "N coins" (Coin Purse): the icon and number in place of the word.
        const row = coinLine(this.scene, PAD, y + gap + size * 0.65, parts, size, { color, bold: line.style === "title" || line.style === "head" });
        box.add(row);
        y += gap + size * 1.3 + 4;
        continue;
      }
      const t = this.scene.add.text(PAD, y + gap, line.text, {
        ...fontRole(size),
        color,
        wordWrap: { width: WIDTH - PAD * 2 },
      });
      box.add(t);
      y += gap + t.height + 4;
    }
    const h = y + PAD - 4;
    bg.fillStyle(0x0d2a20, 0.96);
    bg.fillRoundedRect(0, 0, WIDTH, h, 14);
    bg.lineStyle(3, 0xffe14d, 1);
    bg.strokeRoundedRect(0, 0, WIDTH, h, 14);
    box.setSize(WIDTH, h);
    this.box = box;
    this.move(pointer);
  }

  // Beside the pointer, kept inside the screen.
  private move(pointer: Phaser.Input.Pointer): void {
    const box = this.box;
    if (!box) return;
    const h = box.height;
    let x = pointer.worldX + 24;
    if (x + WIDTH > SCREEN.w - 10) x = pointer.worldX - 24 - WIDTH;
    let y = Math.max(10, Math.min(SCREEN.h - h - 10, pointer.worldY - h / 2));
    x = Math.max(10, x);
    const a = this.avoid;
    if (a && x < a.x + a.w && x + WIDTH > a.x && y < a.y + a.h && y + h > a.y) {
      // Over the avoided area: go just above it, or below if there is no room.
      y = a.y - h - 10 >= 10 ? a.y - h - 10 : a.y + a.h + 10;
    }
    box.setPosition(x, y);
  }
}
