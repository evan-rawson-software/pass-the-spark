import Phaser from "phaser";
import art from "../../data/wizard-art.json";
import type { Look } from "../net/look";
import { hexColour, battleWizardsData as D } from "./presentation";
import { seatLook } from "./runSession";
import { Wizard, WIZARD_FRAME, WIZARD_SCALE, lookColour, wizardTexture } from "./wizard";

// The wizards in battle (#264): one per seat, standing on a spot of the arcane circle's rim, in their
// idle loop with a soft shadow under the feet. The spots are fixed per party size (Z7, data), filled in
// seat order, so every screen shows the same layout. Those on the right half face left, towards the
// circle. A small arrow marks your own wizard, and an away player's wizard is dimmed (Z11). The idle
// loops start at different frames so they do not bob in step. The wizards are made once, on the first
// view, and sit under the redrawn layer (they are in the same world as the tree, so they move with the
// camera). Places are in data/presentation.json (battleWizards). Also here: a seat's portrait for its tab.

const RADIUS = art.circle.radius; // art px: the rim's half width and half height
const CIRCLE = D.circle;

// A seat's look: the one the run holds, or (a dev table with none) the palette's colour in seat order.
export function lookOf(seatOrder: string[], seat: string): Look {
  const saved = seatLook(seat);
  if (saved) return saved;
  const i = Math.max(0, seatOrder.indexOf(seat));
  return { colour: art.colours[i % art.colours.length].id, hat: art.hats[0].id, robe: art.robes[0].id };
}

export interface WizardsInput {
  seatOrder: string[];
  you: string; // the seat that gets the marker
  isAway(seat: string): boolean;
}

interface Standing {
  look: Look;
  wizard: Wizard;
  shadow: Phaser.GameObjects.Ellipse[];
}

export class BattleWizards {
  private standing = new Map<string, Standing>();
  private marker?: Phaser.GameObjects.Graphics;
  private markerTween?: Phaser.Tweens.Tween;
  private markedSeat = "";
  private size = 0;

  constructor(private scene: Phaser.Scene) {}

  // The wizards for these seats (made on the first call and when the party size changes), with the
  // marker on `you` and the away ones dimmed.
  sync(input: WizardsInput): void {
    const seats = input.seatOrder;
    if (seats.length !== this.size) this.build(seats);
    for (const seat of seats) {
      const s = this.standing.get(seat)!;
      const look = lookOf(seats, seat);
      if (JSON.stringify(look) !== JSON.stringify(s.look)) {
        s.look = look;
        s.wizard.setLook(look);
      }
      const alpha = input.isAway(seat) ? D.wizard.awayAlpha : 1;
      s.wizard.setAlpha(alpha);
      s.shadow.forEach((e) => e.setAlpha(D.wizard.shadow.alpha * alpha));
    }
    this.mark(input.you);
  }

  // Where a seat's wizard stands (the middle of its feet), by party size and seat order.
  static spot(size: number, index: number): { x: number; y: number; mirror: boolean } {
    const list = D.spots[String(Math.min(4, Math.max(2, size))) as "2" | "3" | "4"];
    const p = list[Math.min(index, list.length - 1)];
    return { x: CIRCLE.x + p.x * RADIUS[0] * WIZARD_SCALE, y: CIRCLE.y + p.y * RADIUS[1] * WIZARD_SCALE, mirror: p.x > 0 };
  }

  private build(seats: string[]): void {
    this.standing.forEach((s) => {
      s.wizard.destroy();
      s.shadow.forEach((e) => e.destroy());
    });
    this.standing.clear();
    this.size = seats.length;
    // Back to front, so a front wizard is drawn over the one behind it.
    const order = seats.map((seat, i) => ({ seat, i, spot: BattleWizards.spot(seats.length, i) })).sort((a, b) => a.spot.y - b.spot.y);
    for (const { seat, i, spot } of order) {
      const Sh = D.wizard.shadow;
      const shadow: Phaser.GameObjects.Ellipse[] = [];
      for (let l = 0; l < Sh.layers; l++) {
        const f = 1 - l / Sh.layers; // nested ellipses, the widest faintest: a soft edge
        shadow.push(this.scene.add.ellipse(spot.x, spot.y + Sh.dy, Sh.w * f, Sh.h * f, 0x000000, Sh.alpha));
      }
      const look = lookOf(seats, seat);
      const wizard = new Wizard(this.scene, spot.x, spot.y, look, { mirror: spot.mirror });
      wizard.play("idle", undefined, D.wizard.idleOffsetMs[i % D.wizard.idleOffsetMs.length]);
      this.standing.set(seat, { look, wizard, shadow });
    }
    this.markedSeat = "";
  }

  // The arrow over your own wizard's head, bobbing a little.
  private mark(seat: string): void {
    if (seat === this.markedSeat && this.marker?.active) return;
    this.markedSeat = seat;
    this.markerTween?.stop();
    this.marker?.destroy();
    this.marker = undefined;
    const s = this.standing.get(seat);
    if (!s) return;
    const M = D.marker;
    const colour = lookColour(s.look);
    const g = this.scene.add.graphics();
    g.fillStyle(colour, 1).lineStyle(M.outlineWidth, hexColour(M.outline), 1);
    const w = M.size;
    g.fillTriangle(-w, 0, w, 0, 0, w).strokeTriangle(-w, 0, w, 0, 0, w);
    g.setPosition(s.wizard.x, s.wizard.y - WIZARD_FRAME.h * WIZARD_SCALE - M.gap - w);
    this.marker = g;
    this.markerTween = this.scene.tweens.add({ targets: g, y: g.y - M.bob, duration: M.bobMs, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }
}

// A seat's head and hat from its idle frame, centred on (x, y), for its seat tab; added to `parent`.
export function wizardPortrait(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, look: Look, x: number, y: number): void {
  const P = D.portrait;
  const ramp = art.colours.find((c) => c.id === look.colour)?.ramp ?? art.colours[0].ramp;
  const colour = hexColour(ramp[2]);
  const back = scene.add.graphics();
  back.fillStyle(colour, P.backAlpha).fillCircle(x, y, P.r);
  back.lineStyle(P.ringWidth, colour, 1).strokeCircle(x, y, P.r);
  parent.add(back);
  const C = P.crop;
  const image = scene.add.image(x - (C.w * P.scale) / 2, y - (C.h * P.scale) / 2, wizardTexture(scene, look), "idle:0");
  image.setOrigin(0, 0).setScale(P.scale).setCrop(C.x, C.y, C.w, C.h);
  image.setPosition(x - (C.w / 2 + C.x) * P.scale, y - (C.h / 2 + C.y) * P.scale);
  parent.add(image);
}
