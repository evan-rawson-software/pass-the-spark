import Phaser from "phaser";
import type { PlayPreview } from "../engine/battle";
import type { Domino, Effect } from "../engine/types";

// Domino tooltips. No rules here: it formats the domino's static data and, for a
// playable domino in the active hand, the numbers previewPlay returns.

const FONT = "Arial, Helvetica, sans-serif";
const WIDTH = 440;
const PAD = 16;
const SCREEN = { w: 1920, h: 1080 };

const KIND_NAME: Record<Effect["kind"], string> = {
  damage: "Damage",
  block: "Block",
  heal: "Heal",
  amplify: "Amplify",
  echo: "Echo",
  mimic: "Mimic",
  reflect: "Reflect",
  lookout: "Lookout",
};

function effectText(e: Effect): string {
  if (e.kind === "amplify") return `Amplify +${e.base ?? 0}`;
  if (e.base !== undefined) return `${KIND_NAME[e.kind]} ${e.base}`;
  return KIND_NAME[e.kind];
}

export interface TipLine {
  text: string;
  style?: "title" | "head" | "dim";
}

// The preview of one option, as lines.
function previewLines(domino: Domino, p: PlayPreview): string[] {
  if (p.opener) return ["Opener: starts the chain. Its effect does not trigger."];
  const lines: string[] = [];
  const e = p.effect?.effect;
  if (!e) {
    lines.push("Nothing to copy yet.");
  } else {
    const copied = domino.effect.kind === "mimic" || domino.effect.kind === "reflect";
    const times = p.triggers > 1 ? ` × ${p.triggers}` : "";
    let what: string;
    if (e.kind === "damage" || e.kind === "block" || e.kind === "heal") what = `${KIND_NAME[e.kind]} ${p.value}${times}`;
    else if (e.kind === "amplify") what = `Amplify +${p.value}${times}`;
    else if (e.kind === "lookout") what = `Lookout: reveals ${p.lookoutReveals}`;
    else what = `${KIND_NAME[e.kind]}${times}`;
    lines.push((copied ? "Copies " : "") + what);
    if (e.kind === "damage" || e.kind === "block" || e.kind === "heal") lines.push(`at strength ${p.strength}, lap ${p.lap}`);
    if (p.spectrumBonus > 0) lines.push(`Spectrum: +${p.spectrumBonus} strength`);
  }
  if (p.auditorDamage > 0) lines.push(`Auditor: party takes ${p.auditorDamage}`);
  return lines;
}

// Everything the tooltip says. `previews` is previewPlay's result for a playable domino
// in the active hand, or undefined.
export function tipLines(domino: Domino, previews?: PlayPreview[]): TipLine[] {
  const lines: TipLine[] = [{ text: domino.name, style: "title" }];
  lines.push({ text: `Intake: ${domino.intake === "any" ? "any spark" : domino.intake.join(" or ")}` });
  lines.push({ text: `Effect: ${effectText(domino.effect)}` });
  lines.push({ text: `Output: ${domino.output.join(" or ")}` });
  const flags: string[] = [];
  if (domino.effect.spectrum) flags.push("spectrum");
  if (domino.effect.ignoresBlock) flags.push("ignoresBlock");
  if (flags.length > 0) lines.push({ text: `Flags: ${flags.join(", ")}`, style: "dim" });
  if (previews && previews.length > 0) {
    lines.push({ text: "If played now", style: "head" });
    for (const p of previews) {
      if (previews.length > 1 && p.spark) lines.push({ text: `Answering ${p.spark}:`, style: "dim" });
      for (const t of previewLines(domino, p)) lines.push({ text: t });
    }
  }
  return lines;
}

// One tooltip for the scene. attach() makes a game object show it on hover; the previews
// are computed only when the pointer arrives.
export class Tooltip {
  private box?: Phaser.GameObjects.Container;

  // `hiddenFrom`: a camera that must not draw the box (the map's scrolling camera).
  constructor(private scene: Phaser.Scene, private hiddenFrom?: Phaser.Cameras.Scene2D.Camera) {}

  attach(target: Phaser.GameObjects.Container, domino: Domino, previews?: () => PlayPreview[]): void {
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
      const size = line.style === "title" ? 28 : 22;
      const color = line.style === "head" ? "#ffe14d" : line.style === "dim" ? "#9fd1b8" : "#ffffff";
      const gap = line.style === "head" ? 10 : 0;
      const t = this.scene.add.text(PAD, y + gap, line.text, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color,
        fontStyle: line.style === "title" || line.style === "head" ? "bold" : "normal",
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
    this.hiddenFrom?.ignore(box);
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
    const y = Math.max(10, Math.min(SCREEN.h - h - 10, pointer.worldY - h / 2));
    box.setPosition(Math.max(10, x), y);
  }
}
