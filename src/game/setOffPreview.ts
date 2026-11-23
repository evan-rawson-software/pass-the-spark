import Phaser from "phaser";
import type { BattleView } from "../engine/view";
import { hexColour, setOffPreviewData as D } from "./presentation";
import { paintBar } from "./animations";
import type { Refs } from "./animations";
import { fontRole } from "./fonts";

// The "if it fires" preview on the party's bar and block in the bottom strip (#222, B8): the block the
// whole board would give and the health the party would still lose to the intent's full attack (the
// engine's previewBuild, which does not depend on the board being lethal or reaching the line). The loss
// is the pale part of the party's health bar, with the number over its end; with nothing to lose "safe"
// shows instead. The enemy's side is not shown: the damage total is hidden until the cascade fires.
// Every number comes from the engine; this file only places marks and labels. Rebuilt on each update.
// The bar and shield it draws on are the ones the strip drew (the scene's refs), so they can't drift apart.

export type BuildPreview = { block: number; partyDamage: number };

export class SetOffPreviewUi {
  constructor(private scene: Phaser.Scene) {}

  // Draws into `into` (emptied first). No preview (null) draws nothing and takes the pale part off the bar.
  draw(into: Phaser.GameObjects.Container, view: BattleView, p: BuildPreview | null, refs: Refs): void {
    into.removeAll(true);
    const pb = refs.bars.get("party");
    const ps = refs.shields.get("party");
    if (pb) {
      const pale = p && p.partyDamage > 0 ? view.party.health - p.partyDamage : undefined;
      if (pb.pale !== pale && pb.bar.active) {
        pb.pale = pale;
        paintBar(pb, pb.value ?? view.party.health);
      }
    }
    if (!p || !pb || !ps) return;
    const s = this.scene;
    const g = s.add.graphics();
    into.add(g);
    const text = (x: number, y: number, str: string, colour: string, size: number, originX = 0.5) =>
      into.add(s.add.text(x, y, str, { ...fontRole(size), color: colour, strokeThickness: D.text.strokeThickness, stroke: D.text.strokeColour }).setOrigin(originX, 0.5));

    // Party: block gained, health lost to what the intent still does after block (or safe).
    if (p.block > 0) text(ps.x, ps.y - ps.s * 0.5 + D.gain.partyDy, `+${p.block}`, D.gain.colour, D.gain.fontSize);
    if (p.partyDamage > 0) {
      text(pb.x + pb.w + D.loss.dx, pb.y + D.loss.dy, `−${p.partyDamage}`, D.loss.colour, D.loss.fontSize, D.loss.originX);
    } else if (view.intent.actions.some((a) => a.kind === "attack")) {
      this.safe(g, pb.x + D.safe.iconDx, pb.y + D.safe.dy);
      text(pb.x + D.safe.textDx, pb.y + D.safe.dy, "safe", D.safe.colour, D.safe.fontSize, 0);
    }
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
