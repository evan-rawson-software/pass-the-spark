import Phaser from "phaser";
import type { SetOffPreview } from "../engine/battle";
import type { BattleView } from "../engine/view";
import { hexColour, setOffPreviewData as D } from "./presentation";
import { reducedFlashing } from "./comfort";

// The set-off preview drawn over the health bars (#222). Every number comes from the engine's
// previewSetOff; this file only places ghosts, marks and labels. Rebuilt on each update.

interface Box { x: number; y: number; w: number; h: number } // top-left origin
const spots = D.spots as {
  enemyBar: Box;
  enemyShield: { x: number; y: number; s: number };
  partyBar: Box;
  partyShield: { x: number; y: number; s: number };
  setOffButton: Box;
};

export class SetOffPreviewUi {
  private tweens: Phaser.Tweens.Tween[] = [];

  constructor(private scene: Phaser.Scene) {}

  clear(): void {
    this.tweens.forEach((t) => t.stop());
    this.tweens = [];
  }

  // Draws into `into` (emptied first). No preview (null) draws nothing.
  draw(into: Phaser.GameObjects.Container, view: BattleView, p: SetOffPreview | null, glowSetOff: boolean): void {
    this.clear();
    into.removeAll(true);
    if (!p) return;
    const s = this.scene;
    const g = s.add.graphics();
    into.add(g);
    const text = (x: number, y: number, str: string, colour: string, size: number, originX = 0.5) =>
      into.add(s.add.text(x, y, str, { fontFamily: "Arial, Helvetica, sans-serif", fontSize: `${size}px`, color: colour, fontStyle: "bold", strokeThickness: D.text.strokeThickness, stroke: D.text.strokeColour }).setOrigin(originX, 0.5));

    // Enemy: the damage as a ghost from current to projected health, the block it uses up.
    const e = spots.enemyBar;
    const enemy = view.enemy;
    if (p.canSetOff && p.damage > 0) {
      const from = e.w * (p.enemyHealth / enemy.maxHealth);
      const to = e.w * (enemy.health / enemy.maxHealth);
      this.ghost(into, e.x + from, e.y, Math.max(to - from, D.ghost.minWidth), e.h);
      text(e.x + e.w + D.loss.dx, e.y + e.h / 2 + D.loss.dy, `−${p.damage}`, D.loss.colour, D.loss.fontSize, 0);
    }
    if (p.canSetOff && p.enemyBlockUsed > 0) {
      const sh = spots.enemyShield;
      text(sh.x + sh.s * 0.5 + D.gain.enemyShieldDx, sh.y, `−${p.enemyBlockUsed}`, D.gain.colour, D.gain.fontSize, 0);
      if (p.enemyBlock === 0) this.cracks(g, sh.x, sh.y, sh.s);
    }
    if (p.lethal) this.skull(g, e.x + e.h * D.skull.dx, e.y + e.h / 2, D.skull.size);

    // Party: block gained, health lost to what the intent still does after block (or safe).
    const sh = spots.partyShield;
    if (p.partyBlockGain > 0) text(sh.x, sh.y - sh.s * 0.5 + D.gain.partyDy, `+${p.partyBlockGain}`, D.gain.colour, D.gain.fontSize);
    const b = spots.partyBar;
    if (p.partyDamage > 0) {
      const from = b.w * (p.partyHealth / view.party.maxHealth);
      const to = b.w * (view.party.health / view.party.maxHealth);
      this.ghost(into, b.x + from, b.y, Math.max(to - from, D.ghost.minWidth), b.h);
      text(b.x + b.w + D.loss.dx, b.y + b.h / 2 + D.loss.dy, `−${p.partyDamage}`, D.loss.colour, D.loss.fontSize, 0);
    } else if (!p.lethal && view.intent.actions.some((a) => a.kind === "attack")) {
      this.safe(g, b.x + D.safe.iconDx, b.y + D.safe.dy);
      text(b.x + D.safe.textDx, b.y + D.safe.dy, "safe", D.safe.colour, D.safe.fontSize, 0);
    }

    if (glowSetOff) {
      const r = spots.setOffButton;
      const P = D.setOffGlow.pad;
      const glow = s.add.graphics();
      glow.lineStyle(D.setOffGlow.width, hexColour(D.setOffGlow.colour), 1);
      glow.strokeRoundedRect(r.x - P, r.y - P, r.w + 2 * P, r.h + 2 * P, r.h / 2 + P);
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
    D.crack.points.forEach(([dx, dy], i) => (i === 0 ? g.moveTo(x + dx * s, y + dy * s) : g.lineTo(x + dx * s, y + dy * s)));
    g.strokePath();
  }

  private skull(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
    const k = D.skull;
    g.fillStyle(hexColour(k.outlineColour), k.outlineAlpha);
    g.fillCircle(x, y, r + k.outline);
    g.fillStyle(hexColour(k.colour), 1);
    g.fillCircle(x, y + r * k.headDy, r * k.head);
    g.fillRect(x - r * k.jawHalf, y + r * k.jawTop, r * k.jawHalf * 2, r * k.jawH);
    g.fillStyle(hexColour(k.outlineColour), 1);
    g.fillCircle(x - r * k.eyeDx, y + r * k.headDy, r * k.eyeR);
    g.fillCircle(x + r * k.eyeDx, y + r * k.headDy, r * k.eyeR);
  }

  // A small shield with a tick.
  private safe(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    const k = D.safe;
    g.fillStyle(hexColour(k.colour), 1);
    g.fillPoints([[-k.half, -k.top], [k.half, -k.top], [k.half, k.shoulder], [0, k.tip], [-k.half, k.shoulder]].map(([dx, dy]) => new Phaser.Math.Vector2(x + dx, y + dy)), true);
    g.lineStyle(k.tickWidth, hexColour(k.tickColour), 1);
    g.lineBetween(x - 5, y, x - 1, y + 4);
    g.lineBetween(x - 1, y + 4, x + 6, y - 5);
  }
}
