import Phaser from "phaser";
import { loadContent } from "../engine/content";
import type { Charm } from "../engine/types";
import { Tooltip } from "./tooltip";
import { label } from "./ui";

// Charm icons (#108): small code-drawn placeholders. Normal charms are round, rare ones are gold
// diamonds; the colour comes from the charm's place in the data. No rules here: names, descriptions
// and numbers come from data/charms.json.

const COLORS = [0xe8603c, 0x4fa3e8, 0x8fd16a, 0xb08a5a, 0xf0c040, 0xd98ae0, 0x5fd0c0, 0xe0e0e0, 0xc2574f, 0x9f8cf0, 0xf0a030, 0x7fbf7f, 0xff7aa8, 0x6fa0ff, 0xc0a0ff, 0xffa060, 0x60e0a0, 0xe0e060];

let all: Charm[] | null = null;
function allCharms(): Charm[] {
  if (!all) all = loadContent().charms;
  return all;
}

// The charms with these ids, in order; unknown ids are left out.
export function charmsByIds(ids: string[]): Charm[] {
  return ids.flatMap((id) => allCharms().find((c) => c.id === id) ?? []);
}

// One icon, centred on its container's origin, `size` pixels across.
export function charmIcon(scene: Phaser.Scene, charm: Charm, size: number): Phaser.GameObjects.Container {
  const color = COLORS[Math.max(0, allCharms().findIndex((c) => c.id === charm.id)) % COLORS.length];
  const r = size / 2;
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  if (charm.pool === "rare") {
    g.lineStyle(Math.max(2, size / 9), 0xffd23f, 1);
    g.beginPath();
    g.moveTo(0, -r);
    g.lineTo(r, 0);
    g.lineTo(0, r);
    g.lineTo(-r, 0);
    g.closePath();
    g.fillPath();
    g.strokePath();
  } else {
    g.lineStyle(Math.max(2, size / 12), 0x2a2a2a, 1);
    g.fillCircle(0, 0, r);
    g.strokeCircle(0, 0, r);
  }
  const letter = scene.add
    .text(0, 0, charm.name.charAt(0), { fontFamily: "Arial, Helvetica, sans-serif", fontSize: `${Math.round(size * 0.5)}px`, color: "#2a2a2a", fontStyle: "bold" })
    .setOrigin(0.5);
  const c = scene.add.container(0, 0, [g, letter]);
  c.setSize(size, size);
  return c;
}

// An icon with its hover tooltip (name and description).
export function charmWithTip(scene: Phaser.Scene, tooltip: Tooltip, charm: Charm, size: number, x: number, y: number): Phaser.GameObjects.Container {
  const c = charmIcon(scene, charm, size).setPosition(x, y);
  tooltip.attachLines(c, [
    { text: charm.name, style: "title" },
    { text: charm.pool === "rare" ? "Rare charm" : "Charm", style: "dim" },
    { text: charm.description },
  ]);
  return c;
}

// A row of icons starting at x, squeezed to fit `maxW`.
export function drawCharmRow(scene: Phaser.Scene, tooltip: Tooltip, charms: Charm[], x: number, y: number, size: number, maxW: number, onIcon?: (charm: Charm, x: number, y: number) => void): void {
  const step = Math.min(size + 4, charms.length > 1 ? (maxW - size) / (charms.length - 1) : size);
  charms.forEach((ch, i) => {
    charmWithTip(scene, tooltip, ch, size, x + size / 2 + i * step, y);
    onIcon?.(ch, x + size / 2 + i * step, y);
  });
}

function shorten(name: string, max: number): string {
  return name.length > max ? name.slice(0, max - 1) + "…" : name;
}

// The combat table has no free strip along the top, so there everyone's charms are a list, one
// line per player (name, then icons), in the free spot under the right-hand column.
export function drawCharmList(scene: Phaser.Scene, x: number, y: number, seats: string[], names: Record<string, string>, held: Record<string, string[]>, onIcon?: (seat: string, charm: Charm, x: number, y: number) => void): Phaser.GameObjects.GameObject[] {
  const before = scene.children.list.length;
  const tooltip = new Tooltip(scene);
  seats.forEach((id, i) => {
    const cy = y + i * 27;
    label(scene, x, cy, shorten(names[id] ?? id, 9), 18, { bold: true, color: "#9fd1b8" });
    drawCharmRow(scene, tooltip, charmsByIds(held[id] ?? []), x + 110, cy, 22, 200, (ch, ix, iy) => onIcon?.(id, ch, ix, iy));
  });
  return scene.children.list.slice(before);
}

// Everyone's name and charm icons in a strip along the top, left of the party bar.
// `names` maps seat -> display name; `held` maps seat -> charm ids. Returns what it drew.
export function drawPartyCharms(scene: Phaser.Scene, seats: string[], names: Record<string, string>, held: Record<string, string[]>): Phaser.GameObjects.GameObject[] {
  const before = scene.children.list.length;
  const tooltip = new Tooltip(scene);
  const left = 960;
  const colW = Math.min(200, 560 / Math.max(1, seats.length));
  seats.forEach((id, i) => {
    const x = left + i * colW;
    label(scene, x, 42, shorten(names[id] ?? id, Math.floor(colW / 11)), 20, { bold: true, color: "#9fd1b8" });
    drawCharmRow(scene, tooltip, charmsByIds(held[id] ?? []), x, 78, 26, colW - 12);
  });
  return scene.children.list.slice(before);
}
