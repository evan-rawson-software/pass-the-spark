import Phaser from "phaser";
import art from "../../data/wizard-art.json";
import type { Look } from "../net/look";
import { hexColour } from "./presentation";

// Putting a wizard together (#262), from the sheets in public/art/wizards/ and data/wizard-art.json
// (see tools/art/preview.html, which does the same on a page). The layers are drawn in layerOrder,
// the robe and the hat recoloured from the grey key ramp to the look's colour ramp. That happens
// once per look, on a canvas, and the result is kept as a texture: nothing is recoloured per frame.
// Each animation is a row of frames in the texture, named "<animation>:<frame>".

export const WIZARD_FRAME = art.frame; // art pixels per frame: { w, h }
export const WIZARD_SCALE = art.scale; // screen pixels per art pixel at 1920x1080

interface AnimData {
  row: number;
  frames: number;
  ms: number[];
  loop: boolean;
}

// Every animation by name: idle, hurt, victory and the casts by their id.
const ANIMS: Record<string, AnimData> = {
  idle: art.animations.idle,
  hurt: art.animations.hurt,
  victory: art.animations.victory,
  ...Object.fromEntries(art.animations.casts.map((c) => [c.id, c])),
};
const ALL_ANIMS = Object.keys(ANIMS);

const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const colourData = (id: string) => art.colours.find((c) => c.id === id) ?? art.colours[0];

// A colour's seat colour: the middle shade of its ramp (A4).
export function colourNumber(id: string): number {
  return hexColour(colourData(id).ramp[2]);
}

export function lookColour(look: Look): number {
  return colourNumber(look.colour);
}

// The seat colours by palette position, for screens with no look to ask (the dev scenes).
export function paletteColour(i: number): number {
  return hexColour(art.colours[i % art.colours.length].ramp[2]);
}

// Swaps every pixel of a key shade for the colour's shade.
function recolour(canvas: HTMLCanvasElement, colourId: string): void {
  const ctx = canvas.getContext("2d")!;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = image.data;
  const from = art.keyRamp.map(hex);
  const to = colourData(colourId).ramp.map(hex);
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] === 0) continue;
    const j = from.findIndex((f) => f[0] === p[i] && f[1] === p[i + 1] && f[2] === p[i + 2]);
    if (j >= 0) [p[i], p[i + 1], p[i + 2]] = to[j];
  }
  ctx.putImageData(image, 0, 0);
}

const sheetPath = (layer: string, look: Look): string =>
  layer === "hat" ? art.hats.find((h) => h.id === look.hat)!.sheet
  : layer === "robe" ? art.robes.find((r) => r.id === look.robe)!.sheet
  : (art.sheets as Record<string, string>)[layer];

// The texture key for a look and the animations it holds.
function textureKey(look: Look, anims: string[]): string {
  return `wizard/${look.colour}/${look.hat}/${look.robe}/${anims.join(",")}`;
}

// Makes the texture for a look once (a no-op when it exists) and returns its key. `anims` are the
// animations it holds, in row order; a small preview needs only "idle", a battle wizard all of them.
export function wizardTexture(scene: Phaser.Scene, look: Look, anims: string[] = ALL_ANIMS): string {
  const key = textureKey(look, anims);
  if (scene.textures.exists(key)) return key;
  const { w, h } = art.frame;
  const cols = Math.max(...anims.map((a) => ANIMS[a].frames));
  const sheet = document.createElement("canvas");
  sheet.width = cols * w;
  sheet.height = anims.length * h;
  const sheetCtx = sheet.getContext("2d")!;
  for (const layer of art.layerOrder) {
    const path = sheetPath(layer, look);
    const textureId = "art/" + path.replace(/\.[^./]+$/, "");
    if (!scene.textures.exists(textureId)) continue; // the art did not load: that layer is left out
    const source = scene.textures.get(textureId).getSourceImage() as CanvasImageSource;
    const part = document.createElement("canvas");
    part.width = sheet.width;
    part.height = sheet.height;
    const partCtx = part.getContext("2d")!;
    anims.forEach((a, r) => partCtx.drawImage(source, 0, ANIMS[a].row * h, sheet.width, h, 0, r * h, sheet.width, h));
    if (layer === "hat" || layer === "robe") recolour(part, look.colour);
    sheetCtx.drawImage(part, 0, 0);
  }
  const texture = scene.textures.addCanvas(key, sheet)!;
  anims.forEach((a, r) => {
    for (let i = 0; i < ANIMS[a].frames; i++) texture.add(`${a}:${i}`, 0, i * w, r * h, w, h);
  });
  texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

export interface WizardOptions {
  scale?: number; // screen pixels per art pixel (default: the data's scale, ×3)
  mirror?: boolean; // face left
  anims?: string[]; // the animations this wizard can play (default all)
}

// A wizard on screen. (x, y) is where it stands: the middle of its feet. Starts in its idle loop.
export class Wizard extends Phaser.GameObjects.Image {
  private anims: string[];
  private current = "idle";
  private next: string | undefined;
  private elapsed = 0;
  private shown = "";

  constructor(scene: Phaser.Scene, x: number, y: number, look: Look, options: WizardOptions = {}) {
    const anims = options.anims ?? ALL_ANIMS;
    super(scene, x, y, wizardTexture(scene, look, anims), "idle:0");
    this.anims = anims;
    this.setOrigin(0.5, 1).setScale(options.scale ?? WIZARD_SCALE).setFlipX(options.mirror ?? false);
    scene.add.existing(this);
    this.addToUpdateList();
  }

  // Puts on another look (the animation carries on).
  setLook(look: Look): this {
    this.setTexture(wizardTexture(this.scene, look, this.anims));
    this.shown = "";
    return this;
  }

  // Plays an animation by name, from its start or `startMs` in. A loop goes on until another is
  // played; a one-shot holds its last frame, or plays `next` when it ends.
  play(name: string, next?: string, startMs = 0): this {
    this.current = ANIMS[name] && this.anims.includes(name) ? name : "idle";
    this.next = next;
    this.elapsed = startMs;
    this.shown = "";
    this.showFrame();
    return this;
  }

  preUpdate(_time: number, delta: number): void {
    this.elapsed += delta;
    this.showFrame();
  }

  private showFrame(): void {
    const a = ANIMS[this.current];
    const total = a.ms.reduce((s, v) => s + v, 0);
    if (!a.loop && this.elapsed >= total && this.next !== undefined) return void this.play(this.next);
    let t = a.loop ? this.elapsed % total : Math.min(this.elapsed, total);
    let frame = a.frames - 1;
    for (let i = 0; i < a.frames; i++) {
      if (t < a.ms[i]) {
        frame = i;
        break;
      }
      t -= a.ms[i];
    }
    const key = `${this.current}:${frame}`;
    if (key === this.shown) return;
    this.shown = key;
    this.setFrame(key);
  }
}
