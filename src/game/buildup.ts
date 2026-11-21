import Phaser from "phaser";
import presentationJson from "../../data/presentation.json";
import { reducedFlashing, shakeEnabled } from "./comfort";
import { scaleTime } from "./playbackSpeed";
import { playSound } from "./sound";

// The cascade build-up (#191): rising pitch up to a cap, a growing glow on the lit tree, and a gentle
// camera (ease out to frame a big tree, push in on the biggest cap, ease back for the enemy's action).
// The running counter and callout words are now the combo number (comboHype.ts, #234).
// Visual and sound only; numbers come from the engine's events and data/presentation.json
// ("buildup"). Every duration goes through scaleTime. The main camera's zoom and scroll are
// touched only through the Camera helper below, and always restored (clear, or the scene shutting).

const W = 1920;
const H = 1080;

const B = (presentationJson as unknown as {
  buildup: {
    pitch: { maxSteps: number };
    glow: { litMin: number; litMax: number };
    keep: { slot: number; shield: { x: number; y: number; w: number; h: number } };
    camera: { minNodes: number; zoomOut: number; minZoom: number; pad: number; easeMs: number; restoreMs: number; push: { minCap: number; zoom: number; reducedZoom: number; inMs: number; holdMs: number } };
  };
}).buildup;

interface Box { x: number; y: number; w: number; h: number }
interface Pt { x: number; y: number }
export interface BuildupRefs {
  nodes: Map<number, { pos: { x: number; y: number; k: number; w?: number; h?: number } }>;
  slots: Map<number, { x: number; y: number }>;
  bars: Map<string, { x: number; y: number; w: number; h: number }>;
  shields: Map<string, { x: number; y: number }>;
  intent?: Box;
  board?: { bounds(): Box }; // the fuse board: the tree's own bounds, rings and badges included
}

const DW = 240;
const DH = 120;

// The pitch step for the Nth step of a cascade: climbs one step at a time up to the data's cap.
export function pitchLinks(step: number): number {
  return 1 + Math.min(Math.max(step, 0), B.pitch.maxSteps);
}

// How strongly the lit part of the tree glows: grows from litMin to litMax as more of it is lit.
export function litGlowStrength(lit: number, total: number): number {
  const f = total <= 0 ? 1 : Math.min(1, lit / total);
  return B.glow.litMin + (B.glow.litMax - B.glow.litMin) * f;
}

// ---- the camera helper: the only code here that touches the main camera ----

class Camera {
  private tween?: Phaser.Tweens.Tween;
  constructor(private scene: Phaser.Scene) {}

  private get cam(): Phaser.Cameras.Scene2D.Camera {
    return this.scene.cameras.main;
  }

  get zoom(): number {
    return this.cam?.zoom ?? 1;
  }

  // Eases to a zoom and centre.
  to(zoom: number, c: Pt, ms: number, ease = "Sine.easeInOut"): void {
    this.tween?.stop();
    const cam = this.cam;
    const z0 = cam.zoom;
    const x0 = cam.scrollX + W / 2;
    const y0 = cam.scrollY + H / 2;
    this.tween = this.scene.tweens.addCounter({
      from: 0, to: 1, duration: scaleTime(ms), ease,
      onUpdate: (t) => {
        const f = t.getValue() ?? 1;
        this.put(z0 + (zoom - z0) * f, x0 + (c.x - x0) * f, y0 + (c.y - y0) * f);
      },
      onComplete: () => this.put(zoom, c.x, c.y),
    });
  }

  private put(z: number, x: number, y: number): void {
    this.cam.setZoom(z);
    this.cam.setScroll(x - W / 2, y - H / 2);
  }

  // Back to the normal view at once.
  reset(): void {
    this.tween?.stop();
    this.tween = undefined;
    if (this.cam) this.put(1, W / 2, H / 2);
  }

  // Eases back to the normal view (nothing to do if it is already there).
  restore(ms: number): void {
    const cam = this.cam;
    if (cam.zoom === 1 && cam.scrollX === 0 && cam.scrollY === 0 && !this.tween?.isPlaying()) return;
    this.to(1, { x: W / 2, y: H / 2 }, ms);
  }
}

// The view (zoom z, centre c) is moved so it keeps `keep` fully on screen, and stays on the canvas
// when zoomed in. Zoom is lowered if `keep` cannot fit at all.
function framed(z: number, c: Pt, keep: Box): { z: number; c: Pt } {
  z = Math.max(z, 0.2);
  if (z > 1) z = Math.max(1, Math.min(z, W / keep.w, H / keep.h));
  const vw = W / z;
  const vh = H / z;
  let lx = keep.x + keep.w - vw / 2;
  let hx = keep.x + vw / 2;
  let ly = keep.y + keep.h - vh / 2;
  let hy = keep.y + vh / 2;
  if (z >= 1) {
    lx = Math.max(lx, vw / 2); hx = Math.min(hx, W - vw / 2);
    ly = Math.max(ly, vh / 2); hy = Math.min(hy, H - vh / 2);
  }
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(Math.max(lo, hi), v));
  return { z, c: { x: clamp(c.x, lx, hx), y: clamp(c.y, ly, hy) } };
}

export class Buildup {
  // Where the whole tree has to fit: the board mat, from the scene's own layout.
  frame: () => Box = () => ({ x: 370, y: 400, w: 1180, h: 360 });
  private cam: Camera;
  private active = false;
  private big = false; // the board is over the camera's size: it moves
  private steps = 0;
  private biggest = 0;
  private base: { z: number; c: Pt } = { z: 1, c: { x: W / 2, y: H / 2 } };
  private token = 0; // bumped on every clear, so a pending hold does nothing after it
  private keep: Box = { x: 0, y: 0, w: W, h: H };

  constructor(private scene: Phaser.Scene) {
    this.cam = new Camera(scene);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.token++;
      this.cam.reset();
    });
  }

  // The pitch step for the next cascade step (a lit domino or a cap).
  step(): number {
    return pitchLinks(this.steps++);
  }

  // The cascade is set off: frame a big tree.
  begin(refs: BuildupRefs, nodeCount: number): void {
    this.clear();
    this.active = true;
    this.big = nodeCount > B.camera.minNodes;
    this.keep = this.keepBox(refs);
    if (!this.big) return;
    const t = this.treeBox(refs);
    const f = this.frame();
    const fit = Math.min(B.camera.zoomOut, f.w / t.w, f.h / t.h);
    const z = Math.max(B.camera.minZoom, Math.min(1, fit));
    this.base = framed(z, { x: t.x + t.w / 2, y: t.y + t.h / 2 }, this.keep);
    this.cam.to(this.base.z, this.base.c, B.camera.easeMs);
  }

  // A cap went off: on a big board the camera pushes in on a new biggest one, then eases back out.
  cap(value: number, at: Pt | undefined): void {
    if (!this.active || !this.big || !at || value <= this.biggest) return;
    this.biggest = value;
    const p = B.camera.push;
    if (value < p.minCap || !shakeEnabled()) return; // the push is motion: off with the shake setting
    const to = framed(reducedFlashing() ? p.reducedZoom : p.zoom, { x: (at.x + this.base.c.x) / 2, y: (at.y + this.base.c.y) / 2 }, this.keep);
    this.cam.to(to.z, to.c, p.inMs, "Cubic.easeOut");
    playSound("whoosh", pitchLinks(this.steps));
    const token = this.token;
    this.scene.time.delayedCall(scaleTime(p.inMs + p.holdMs), () => {
      if (token === this.token) this.cam.to(this.base.z, this.base.c, B.camera.restoreMs);
    });
  }

  // The cascade is over (the enemy acts, the slam starts, or the battle ended early): no more build-up,
  // the camera eases back.
  finish(): void {
    if (!this.active) return;
    this.active = false;
    this.token++;
    this.cam.restore(B.camera.restoreMs);
  }

  // Everything back to normal at once (a new round, a skipped cascade, the step is over).
  clear(): void {
    this.active = false;
    this.token++;
    this.steps = 0;
    this.biggest = 0;
    this.big = false;
    this.base = { z: 1, c: { x: W / 2, y: H / 2 } };
    this.cam.reset();
  }

  // The tree's bounds with a margin: every domino and open end.
  private treeBox(refs: BuildupRefs): Box {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (x: number, y: number, w: number, h: number) => {
      x0 = Math.min(x0, x - w / 2); x1 = Math.max(x1, x + w / 2);
      y0 = Math.min(y0, y - h / 2); y1 = Math.max(y1, y + h / 2);
    };
    refs.nodes.forEach((n) => grow(n.pos.x, n.pos.y, (n.pos.w ?? DW) * n.pos.k, (n.pos.h ?? DH) * n.pos.k));
    const bb = refs.board?.bounds();
    if (bb) grow(bb.x + bb.w / 2, bb.y + bb.h / 2, bb.w, bb.h);
    refs.slots.forEach((s) => grow(s.x, s.y, B.keep.slot, B.keep.slot));
    if (x0 > x1) return this.frame();
    const p = B.camera.pad;
    return { x: x0 - p, y: y0 - p, w: x1 - x0 + 2 * p, h: y1 - y0 + 2 * p };
  }

  // What the camera must never cut off: the enemy's and the party's health and block, and the intent.
  private keepBox(refs: BuildupRefs): Box {
    const boxes: Box[] = [];
    refs.bars.forEach((b) => boxes.push(b));
    refs.shields.forEach((s) => boxes.push({ x: s.x + B.keep.shield.x, y: s.y + B.keep.shield.y, w: B.keep.shield.w, h: B.keep.shield.h }));
    if (refs.intent) boxes.push(refs.intent);
    if (boxes.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
    const x0 = Math.min(...boxes.map((b) => b.x));
    const y0 = Math.min(...boxes.map((b) => b.y));
    return { x: x0, y: y0, w: Math.max(...boxes.map((b) => b.x + b.w)) - x0, h: Math.max(...boxes.map((b) => b.y + b.h)) - y0 };
  }
}
