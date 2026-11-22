import Phaser from "phaser";
import art from "../../data/wizard-art.json";
import type { Spark } from "../engine/types";
import { reducedFlashing } from "./comfort";
import { scaleTime } from "./playbackSpeed";
import { battleWizardsData, hexColour, spellData as D } from "./presentation";
import { recolourRamp } from "./wizard";

// Spells on the table (#265, A6, A7, Z9), drawn from the sheets in public/art/spells/ and described in
// data/wizard-art.json: a damage cap's spell flies from its cap to the enemy card and plays its impact
// there; a block cap raises a ward in its spark's colour in front of its owner; at the slam the circle
// fires the final spell, scaled and tinted by the combo's tier. Everything is drawn screen-fixed (like the
// combo number) and placed from table points against the camera each frame. Times and sizes are in
// data/presentation.json (spells) and go through scaleTime. With reduced flashing the spells are dimmer.
// A sheet that did not load (no art) is left out: a flight then just waits out its time.

type Pt = { x: number; y: number };
type Image = Phaser.GameObjects.Image;
interface Anim { row: number; ms: number[] }
interface Play { onUpdate?: (k: number) => void; done?: () => void; ended?: () => void; keep?: boolean }

const W = 1920;
const H = 1080;
const SCALE = art.scale;
const CIRCLE = battleWizardsData.circle;
const textureId = (sheet: string): string => "art/" + sheet.replace(/\.[^./]+$/, "");
const total = (ms: number[]): number => ms.reduce((s, v) => s + v, 0);

// The frame an animation shows `t` ms in (a loop wraps, a one-shot holds its last frame).
function frameAt(ms: number[], t: number, loop: boolean): number {
  let left = loop ? t % total(ms) : t;
  for (let i = 0; i < ms.length; i++) {
    if (left < ms[i]) return i;
    left -= ms[i];
  }
  return ms.length - 1;
}

interface Ward { image: Image; world: Pt; dx: number; rise: number }

export class Spells {
  private root: Phaser.GameObjects.Container;
  private live = new Set<() => void>(); // everything in the air, each a way to end it at once
  private wards: Ward[] = [];
  private fading = new Set<Ward>();
  private onUpdate = () => this.sync();

  constructor(private scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setScrollFactor(0).setDepth(128); // under the combo number (130)
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate));
  }

  // The root cancels the camera's zoom; wards follow their wizards.
  private sync(): void {
    const z = this.scene.cameras.main?.zoom || 1;
    this.root.setPosition(W / 2 - W / 2 / z, H / 2 - H / 2 / z).setScale(1 / z);
    for (const w of [...this.wards, ...this.fading]) {
      if (!w.image.active) continue;
      const at = this.screen(w.world);
      w.image.setPosition(at.x + w.dx, at.y + D.ward.dy + w.rise);
    }
  }

  // A point on the table, as it appears on screen now.
  private screen(p: Pt): Pt {
    const cam = this.scene.cameras.main;
    const z = cam.zoom || 1;
    return { x: W / 2 + (p.x - (cam.scrollX + W / 2)) * z, y: H / 2 + (p.y - (cam.scrollY + H / 2)) * z };
  }

  // Names the frames of a sheet (columns by rows) once; false when the sheet did not load.
  private frames(id: string, w: number, h: number, cols: number, rows: number): boolean {
    if (!this.scene.textures.exists(id)) return false;
    const tex = this.scene.textures.get(id);
    if (!tex.has("0:0")) {
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) tex.add(`${r}:${c}`, 0, c * w, r * h, w, h);
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
    return true;
  }

  // One animation of a sheet playing over `ms` (a loop spreads `ms` over the loop's own length times
  // the progress, so it keeps cycling as it flies). The image is destroyed at the end (unless `keep`).
  // Returns the way to end it early (which calls `ended`).
  private play(image: Image, anim: Anim, ms: number, loop: boolean, p: Play = {}): () => void {
    const tween = this.scene.tweens.addCounter({
      from: 0, to: 1, duration: scaleTime(ms),
      onUpdate: (t) => {
        const k = t.getValue() ?? 1;
        image.setFrame(`${anim.row}:${frameAt(anim.ms, k * (loop ? ms : total(anim.ms)), loop)}`);
        p.onUpdate?.(k);
      },
      onComplete: () => {
        this.live.delete(end);
        if (!p.keep) image.destroy();
        p.done?.();
      },
    });
    const end = (): void => {
      if (!this.live.delete(end)) return;
      tween.stop();
      if (!p.keep) image.destroy();
      p.ended?.();
    };
    this.live.add(end);
    return end;
  }

  // A damage spell: from `from` (a cap on the table) to the enemy card (`to`), offset by the turn's
  // impact offset, then its impact. `land` is called as it arrives. Returns the way to end it early.
  fly(spark: Spark, from: Pt, to: () => Pt, turn: number, land: () => void): () => void {
    const def = art.spells.find((s) => s.spark === spark) ?? art.spells[0];
    const id = textureId(def.sheet);
    if (!this.frames(id, def.frame.w, def.frame.h, 4, 2)) {
      const call = this.scene.time.delayedCall(scaleTime(D.flightMs), land);
      return () => call.remove(false);
    }
    const o = D.impactOffsets[turn % D.impactOffsets.length];
    const start = this.screen(from);
    const dim = reducedFlashing() ? D.reducedAlpha : 1;
    const image = this.scene.add.image(start.x, start.y, id, "0:0").setOrigin(def.head[0] / def.frame.w, def.head[1] / def.frame.h).setScale(SCALE).setAlpha(dim);
    this.root.add(image);
    const end = (): Pt => {
      const p = this.screen(to());
      return { x: p.x + o[0], y: p.y + o[1] };
    };
    const angle = Math.atan2(end().y - start.y, end().x - start.x);
    image.setRotation(angle).setFlipY(Math.cos(angle) < 0); // flying left, it stays the right way up
    let last = end();
    return this.play(image, def.flight, D.flightMs, true, {
      onUpdate: (k) => {
        last = end();
        const e = k * k;
        image.setPosition(start.x + (last.x - start.x) * e, start.y + (last.y - start.y) * e);
      },
      done: () => {
        const hit = this.scene.add.image(last.x, last.y, id, "1:0").setScale(SCALE).setAlpha(dim);
        this.root.add(hit);
        this.play(hit, def.impact, total(def.impact.ms), false);
        land();
      },
    });
  }

  // A ward rises in front of a wizard standing at `world` (its feet) and stays until endWards.
  ward(spark: Spark, world: Pt): void {
    const colour = art.ward.colours.find((c) => c.spark === spark) ?? art.ward.colours[0];
    const key = `ward/${colour.spark}`;
    const sheet = textureId(art.ward.sheet);
    if (!this.scene.textures.exists(key) && this.scene.textures.exists(sheet)) {
      const canvas = document.createElement("canvas");
      canvas.width = art.ward.frame.w * art.ward.frames;
      canvas.height = art.ward.frame.h;
      canvas.getContext("2d")!.drawImage(this.scene.textures.get(sheet).getSourceImage() as CanvasImageSource, 0, 0);
      recolourRamp(canvas, colour.ramp);
      this.scene.textures.addCanvas(key, canvas);
    }
    if (!this.frames(key, art.ward.frame.w, art.ward.frame.h, art.ward.frames, 1)) return;
    const dx = D.ward.offsets[this.wards.length % D.ward.offsets.length];
    const image = this.scene.add.image(0, 0, key, "0:0").setOrigin(0.5, 1).setScale(SCALE).setAlpha(D.ward.alpha * (reducedFlashing() ? D.ward.reducedAlpha : 1));
    this.root.add(image);
    const ward: Ward = { image, world, dx, rise: D.ward.riseFrom };
    this.wards.push(ward);
    this.play(image, { row: 0, ms: art.ward.ms }, total(art.ward.ms), false, {
      onUpdate: (k) => (ward.rise = D.ward.riseFrom * (1 - k) * (1 - k)),
      done: () => (ward.rise = 0),
      keep: true,
    });
    this.sync();
  }

  // The cascade is over: the wards fade (`now`: they are gone at once).
  endWards(now: boolean): void {
    const wards = this.wards;
    this.wards = [];
    for (const w of wards) {
      if (now || !w.image.active) {
        w.image.destroy();
        continue;
      }
      this.fading.add(w);
      const tween = this.scene.tweens.add({
        targets: w.image, alpha: 0, duration: scaleTime(D.ward.fadeMs),
        onComplete: () => {
          this.fading.delete(w);
          this.live.delete(gone);
          w.image.destroy();
        },
      });
      const gone = (): void => {
        tween.stop();
        this.fading.delete(w);
        w.image.destroy();
      };
      this.live.add(gone);
    }
  }

  // The final spell flies from the circle to the enemy over `ms`. Resolves when it arrives (or is ended early).
  finalFlight(tier: number, killed: boolean, to: () => Pt, ms: number): Promise<void> {
    const F = art.finalSpell;
    const id = textureId(F.sheet);
    if (!this.frames(id, F.frame.w, F.frame.h, 6, 2)) return new Promise((resolve) => this.scene.time.delayedCall(scaleTime(ms), resolve));
    const start = this.screen({ x: CIRCLE.x, y: CIRCLE.y });
    const image = this.scene.add.image(start.x, start.y, id, "0:0").setOrigin(F.head[0] / F.frame.w, F.head[1] / F.frame.h);
    this.look(image, tier, killed);
    this.root.add(image);
    const aim = this.screen(to());
    const angle = Math.atan2(aim.y - start.y, aim.x - start.x);
    image.setRotation(angle).setFlipY(Math.cos(angle) < 0);
    return new Promise((resolve) => {
      this.play(image, F.flight, ms, true, {
        onUpdate: (k) => {
          const p = this.screen(to());
          const e = k * k * k;
          image.setPosition(start.x + (p.x - start.x) * e, start.y + (p.y - start.y) * e);
        },
        done: resolve,
        ended: resolve,
      });
    });
  }

  // The final spell's impact on the enemy: it plays beside the slam's own burst, and never flashes the screen.
  finalImpact(tier: number, killed: boolean, at: Pt): void {
    const F = art.finalSpell;
    const id = textureId(F.sheet);
    if (!this.frames(id, F.frame.w, F.frame.h, 6, 2)) return;
    const p = this.screen(at);
    const image = this.scene.add.image(p.x, p.y, id, "1:0");
    this.look(image, tier, killed);
    this.root.add(image);
    this.play(image, F.impact, total(F.impact.ms), false);
  }

  // The final spell's size and tint by tier (biggest on a kill), dimmer with reduced flashing.
  private look(image: Image, tier: number, killed: boolean): void {
    const F = D.final;
    image.setScale(SCALE * (killed ? F.lethalScale : F.scales[tier]));
    image.setTint(hexColour(killed ? F.lethalTint : F.tints[tier]));
    image.setAlpha(reducedFlashing() ? F.reducedAlpha : 1);
  }

  // Everything away at once: a skipped cascade, a new round, the scene going.
  clear(): void {
    for (const end of [...this.live]) end();
    this.live.clear();
    this.endWards(true);
    for (const w of this.fading) w.image.destroy();
    this.fading.clear();
  }
}
