import Phaser from "phaser";
import type { SetOffPreview } from "../engine/battle";
import type { BattleView } from "../engine/view";
import { hexColour, setOffPreviewData as D } from "./presentation";
import { reducedFlashing } from "./comfort";

// The set-off preview drawn over the health bars (#222). Every number comes from the engine's
// previewSetOff; this file only places ghosts, marks and labels. Rebuilt on each update.

interface Box { x: number; y: number; w: number; h: number } // top-left origin
export interface PreviewSpots {
  enemyBar: Box;
  enemyShield: { x: number; y: number; s: number };
  partyBar: Box;
  partyShield: { x: number; y: number; s: number };
  setOffButton: Box;
}

export class SetOffPreviewUi {
  private tweens: Phaser.Tweens.Tween[] = [];

  constructor(private scene: Phaser.Scene) {}

  clear(): void {
    this.tweens.forEach((t) => t.stop());
    this.tweens = [];
  }

  // Draws into `into` (emptied first). No preview (null) draws nothing.
  draw(into: Phaser.GameObjects.Container, view: BattleView, p: SetOffPreview | null, spots: PreviewSpots, glowSetOff: boolean): void {
    this.clear();
    into.removeAll(true);
    if (!p) return;
    const s = this.scene;
    const g = s.add.graphics();
    into.add(g);
    const text = (x: number, y: number, str: string, colour: string, size: number, originX = 0.5) =>
      into.add(s.add.text(x, y, str, { fontFamily: "Arial, Helvetica, sans-serif", fontSize: `${size}px`, color: colour, fontStyle: "bold", stroke: "#101010", strokeThickness: 5 }).setOrigin(originX, 0.5));

    // Enemy: the damage as a ghost from current to projected health, the block it uses up.
    const e = spots.enemyBar;
    const enemy = view.enemy;
    if (p.canSetOff && p.damage > 0) {
      const from = e.w * (p.enemyHealth / enemy.maxHealth);
      const to = e.w * (enemy.health / enemy.maxHealth);
      this.ghost(into, e.x + from, e.y, Math.max(to - from, 2), e.h);
      text(e.x + e.w, e.y - 16, `−${p.damage}`, D.loss.colour, D.loss.fontSize, 1);
    }
    if (p.canSetOff && p.enemyBlockUsed > 0) {
      const sh = spots.enemyShield;
      text(sh.x + sh.s * 0.5 + 70, sh.y, `−${p.enemyBlockUsed}`, D.gain.colour, D.gain.fontSize, 0);
      if (p.enemyBlock === 0) this.cracks(g, sh.x, sh.y, sh.s);
    }
    if (p.lethal) this.skull(g, e.x + e.h * 0.6, e.y + e.h / 2, D.skull.size);

    // Party: block gained, health lost to what the intent still does after block (or safe).
    const sh = spots.partyShield;
    if (p.partyBlockGain > 0) text(sh.x, sh.y - sh.s * 0.5 - 20, `+${p.partyBlockGain}`, D.gain.colour, D.gain.fontSize);
    const b = spots.partyBar;
    if (p.partyDamage > 0) {
      const from = b.w * (p.partyHealth / view.party.maxHealth);
      const to = b.w * (view.party.health / view.party.maxHealth);
      this.ghost(into, b.x + from, b.y, Math.max(to - from, 2), b.h);
      text(b.x + b.w, b.y + b.h + 18, `−${p.partyDamage}`, D.loss.colour, D.loss.fontSize, 1);
    } else if (!p.lethal && view.intent.actions.some((a) => a.kind === "attack")) {
      this.safe(g, b.x + 12, b.y + b.h + 18);
      text(b.x + 30, b.y + b.h + 18, "safe", D.safe.colour, D.safe.fontSize, 0);
    }

    if (glowSetOff) {
      const r = spots.setOffButton;
      const glow = s.add.graphics();
      glow.lineStyle(7, hexColour(D.setOffGlow.colour), 1);
      glow.strokeRoundedRect(r.x - 5, r.y - 5, r.w + 10, r.h + 10, r.h / 2 + 5);
      into.add(glow);
      this.pulse(glow, D.setOffGlow.alphaLow, D.setOffGlow.alphaHigh, D.setOffGlow.pulseMs);
    }
  }

  private ghost(into: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number): void {
    const r = this.scene.add.rectangle(x, y, w, h, hexColour(D.ghost.colour), 1).setOrigin(0, 0);
    into.add(r);
    this.pulse(r, D.ghost.alphaLow, D.ghost.alphaHigh, D.ghost.pulseMs);
  }

  // Pulses alpha; under reduced flashing the object just stays at the high alpha.
  private pulse(o: Phaser.GameObjects.Graphics | Phaser.GameObjects.Rectangle, low: number, high: number, ms: number): void {
    o.setAlpha(high);
    if (reducedFlashing()) return;
    this.tweens.push(this.scene.tweens.add({ targets: o, alpha: low, duration: ms / 2, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }));
  }

  private cracks(g: Phaser.GameObjects.Graphics, x: number, y: number, s: number): void {
    g.lineStyle(D.crack.width, hexColour(D.crack.colour), 1);
    g.beginPath();
    g.moveTo(x - s * 0.1, y - s * 0.5);
    g.lineTo(x + s * 0.12, y - s * 0.1);
    g.lineTo(x - s * 0.12, y + s * 0.15);
    g.lineTo(x + s * 0.05, y + s * 0.55);
    g.strokePath();
  }

  private skull(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    g.fillStyle(0x101010, 0.85);
    g.fillCircle(x, y, r + 4);
    g.fillStyle(hexColour(D.skull.colour), 1);
    g.fillCircle(x, y - r * 0.15, r * 0.8);
    g.fillRect(x - r * 0.4, y + r * 0.35, r * 0.8, r * 0.5);
    g.fillStyle(0x101010, 1);
    g.fillCircle(x - r * 0.3, y - r * 0.15, r * 0.22);
    g.fillCircle(x + r * 0.3, y - r * 0.15, r * 0.22);
  }

  // A small shield with a tick.
  private safe(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(hexColour(D.safe.colour), 1);
    g.fillPoints([new Phaser.Math.Vector2(x - 10, y - 11), new Phaser.Math.Vector2(x + 10, y - 11), new Phaser.Math.Vector2(x + 10, y + 2), new Phaser.Math.Vector2(x, y + 12), new Phaser.Math.Vector2(x - 10, y + 2)], true);
    g.lineStyle(3, 0x10301c, 1);
    g.lineBetween(x - 5, y, x - 1, y + 4);
    g.lineBetween(x - 1, y + 4, x + 6, y - 5);
  }
}
