/// <reference types="vite/client" />
import Phaser from "phaser";

// The one place that knows about generated art (public/art/, listed in public/art/manifest.json;
// see docs/art-assets.md). Drawing code asks `artImage` for a key such as "sparks/Ember" and
// falls back to its code-drawn version when it gets null. Nothing else checks for files.

const BASE = `${import.meta.env.BASE_URL}art/`;
let listed: string[] = [];

// Reads the manifest. A missing, unreadable or empty one means no art, silently.
export async function readArtManifest(): Promise<void> {
  // A hung request must not stop the game starting: after a few seconds, go on without art.
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), 3000);
  try {
    const res = await fetch(`${BASE}manifest.json`, { signal: stop.signal });
    const data: unknown = res.ok ? await res.json() : [];
    if (Array.isArray(data)) listed = data.filter((p): p is string => typeof p === "string");
  } catch {
    listed = [];
  } finally {
    clearTimeout(timer);
  }
}

const textureKey = (key: string): string => `art/${key}`;
const keyOf = (path: string): string => path.replace(/\.[^./]+$/, "");

// The first scene: loads every listed file, then starts the real first scene. A file that fails
// to load never becomes a texture, so its key falls back to the code-drawn version.
export class ArtBootScene extends Phaser.Scene {
  constructor() {
    super("artBoot");
  }

  preload(): void {
    for (const path of listed) this.load.image(textureKey(keyOf(path)), BASE + path);
  }

  create(): void {
    // Art converted onto the pixel grid (tools/art/convert.py) scales without smoothing, like the wizards.
    for (const path of listed) {
      if (/^(enemies|backgrounds|map|ui|charms)\//.test(path) && this.textures.exists(textureKey(keyOf(path)))) {
        this.textures.get(textureKey(keyOf(path))).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }
    this.scene.start(this.scene.manager.scenes[1].sys.settings.key); // the first of the real scenes
  }
}

// An image for `key`, centred on (x, y) and scaled to fit inside w x h (mode "fit"), or to cover
// the box, cropped to it (mode "cover"), added to `parent` if given. Null when there is no art.
export function artImage(scene: Phaser.Scene, key: string, x: number, y: number, w: number, h: number, parent?: Phaser.GameObjects.Container | null, mode: "fit" | "cover" = "fit"): Phaser.GameObjects.Image | null {
  const tk = textureKey(key);
  if (!scene.textures.exists(tk)) return null;
  const img = scene.add.image(x, y, tk);
  const f = mode === "fit" ? Math.min(w / img.width, h / img.height) : Math.max(w / img.width, h / img.height);
  img.setScale(f);
  if (mode === "cover") {
    const cw = Math.min(img.width, w / f);
    const ch = Math.min(img.height, h / f);
    img.setCrop((img.width - cw) / 2, (img.height - ch) / 2, cw, ch);
  }
  parent?.add(img);
  return img;
}

// A full-screen background (backgrounds/<name>), behind everything drawn after it. False when
// there is none, and the caller keeps its code-drawn background.
export function artBackground(scene: Phaser.Scene, name: string, parent?: Phaser.GameObjects.Container | null): boolean {
  return artImage(scene, `backgrounds/${name}`, 960, 540, 1920, 1080, parent, "cover") !== null;
}
