/// <reference types="vite/client" />
import Phaser from "phaser";

// The one place that knows about generated art (public/art/, listed in public/art/manifest.json;
// see docs/art-assets.md). Drawing code asks `artImage` for a key such as "sparks/Ember" and
// falls back to its code-drawn version when it gets null. Nothing else checks for files.

const BASE = `${import.meta.env.BASE_URL}art/`;
let listed: string[] = [];

// Reads the manifest. A missing, unreadable or empty one means no art, silently.
export async function readArtManifest(): Promise<void> {
  try {
    const res = await fetch(`${BASE}manifest.json`);
    const data: unknown = res.ok ? await res.json() : [];
    if (Array.isArray(data)) listed = data.filter((p): p is string => typeof p === "string");
  } catch {
    listed = [];
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
    this.scene.start(this.scene.manager.scenes[1].sys.settings.key); // the first of the real scenes
  }
}

// An image for `key`, centred on (x, y) and scaled to fit inside w x h, added to `parent` if given.
// Null when there is no art for the key.
export function artImage(scene: Phaser.Scene, key: string, x: number, y: number, w: number, h: number, parent?: Phaser.GameObjects.Container | null): Phaser.GameObjects.Image | null {
  const tk = textureKey(key);
  if (!scene.textures.exists(tk)) return null;
  const img = scene.add.image(x, y, tk);
  img.setScale(Math.min(w / img.width, h / img.height));
  parent?.add(img);
  return img;
}
