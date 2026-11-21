import Phaser from "phaser";
import type { SetOffPreview } from "../engine/battle";
import type { BattleView } from "../engine/view";
import { hexColour, setOffPreviewData as D } from "./presentation";
import { reducedFlashing } from "./comfort";
import type { Refs } from "./animations";

// The set-off preview drawn over the party's bar and shield (#222, B8): the block the party would
// gain and the health it would still lose to the intent. The enemy's side (its damage ghost, the block it
// uses up, the lethal skull) is not shown: the damage total is hidden until the cascade fires. Every number
// comes from the engine's previewSetOff; this file only places ghosts, marks and labels. Rebuilt on each
// update. The bars and shields it draws on are the ones the column drew (the scene's refs), so they can't
// drift apart.

export class SetOffPreviewUi {
  private tweens: Phaser.Tweens.Tween[] = [];

  constructor(private scene: Phaser.Scene) {}

  clear(): void {
    this.tweens.forEach((t) => t.stop());
    this.tweens = [];
  }

  // Draws into `into` (emptied first). No preview (null) draws nothing.
  draw(into: Phaser.GameObjects.Container, view: BattleView, p: SetOffPreview | null, refs: Refs): void {
    this.clear();
    into.removeAll(true);
    const pb = refs.bars.get("party");
    const ps = refs.shields.get("party");
    if (!p || !pb || !ps) return;
    const s = this.scene;
    const g = s.add.graphics();
    into.add(g);
    const text = (x: number, y: number, str: string, colour: string, size: number, originX = 0.5) =>
      into.add(s.add.text(x, y, str, { fontFamily: "Arial, Helvetica, sans-serif", fontSize: `${size}px`, color: colour, fontStyle: "bold", strokeThickness: D.text.strokeThickness, stroke: D.text.strokeColour }).setOrigin(originX, 0.5));

    // Party: block gained, health lost to what the intent still does after block (or safe).
    const sh = ps;
    if (p.partyBlockGain > 0) text(sh.x, sh.y - sh.s * 0.5 + D.gain.partyDy, `+${p.partyBlockGain}`, D.gain.colour, D.gain.fontSize);
    const b = pb;
    if (p.partyDamage > 0) {
      const from = b.w * (p.partyHealth / view.party.maxHealth);
      const to = b.w * (view.party.health / view.party.maxHealth);
      this.ghost(into, b.x + from, b.y, Math.max(to - from, D.ghost.minWidth), b.h);
      text(b.x + b.w + D.loss.dx, b.y + b.h / 2 + D.loss.dy, `−${p.partyDamage}`, D.loss.colour, D.loss.fontSize, D.loss.originX);
    } else if (view.intent.actions.some((a) => a.kind === "attack")) {
      this.safe(g, b.x + D.safe.iconDx, b.y + D.safe.dy);
      text(b.x + D.safe.textDx, b.y + D.safe.dy, "safe", D.safe.colour, D.safe.fontSize, 0);
    }
  }

  private ghost(into: Phaser.GameObjects.Container, x: number, y: number, w: number, h: number): void {
    const r = this.scene.add.rectangle(x, y, w, h, hexColour(D.ghost.colour), 1).setOrigin(0, 0);
    into.add(r);
    this.pulse(r, D.ghost.alphaLow, D.ghost.alphaHigh, D.ghost.pulseMs);
  }

  // Pulses alpha; under reduced flashing the object just stays at the high alpha.
  pulse(o: Phaser.GameObjects.Graphics | Phaser.GameObjects.Rectangle, low: number, high: number, ms: number): void {
    o.setAlpha(high);
    if (reducedFlashing()) return;
    this.tweens.push(this.scene.tweens.add({ targets: o, alpha: low, duration: ms / 2, yoyo: true, repeat: -1, ease: "Sine.easeInOut" }));
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
