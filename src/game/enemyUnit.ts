import Phaser from "phaser";
import { halvedIntent } from "../engine/battle";
import type { BattleView } from "../engine/view";
import type { Intent, Passive } from "../engine/types";
import enemyArt from "../../data/enemy-art.json";
import presentation from "../../data/presentation.json";
import { drawEffectIcon, drawSparkGlyph } from "./dominoDrawing";
import { drawPadlock, drawPassiveIcon } from "./passiveIcon";
import { drawBlessedGlow } from "./sparkShrineArt";
import { combatLayoutData, hexColour } from "./presentation";
import { enemies } from "./devBattle";
import type { CombatCtx, Layer } from "./combatCtx";
import { fitText } from "./combatCtx";
import { fontRole, snap } from "./fonts";
import { drawPlate } from "./kit";

// The enemy on the table (#302): its sprite standing to the right of the arcane circle, facing the party,
// with its block (tier, name, passive chips, health bar, block, the line) top right and its next action
// as a bubble over its head. Layout only: every value is from the view; sizes and places are in
// data/presentation.json (combatLayout.enemy) and the sprite's size, feet and head are in data/enemy-art.json.

const D = combatLayoutData.enemy;
const U = presentation.kit.unit;

interface ArtEntry { w: number; h: number; feet: number[]; head: number[] }
const ART = enemyArt.enemies as Record<string, ArtEntry>;
const NO_ART: ArtEntry = { w: 120, h: 130, feet: [60, 129], head: [60, 0] };

// Where an enemy's sprite is on the screen: its centre and size, and its feet and head points.
export interface Stand {
  x: number; y: number; w: number; h: number;
  feet: { x: number; y: number };
  head: { x: number; y: number };
}

// The sprite stands with its feet on the table spot, moved left when it is wide enough to pass the screen's right margin.
export function standOf(id: string): Stand {
  const art = ART[id] ?? NO_ART;
  const S = D.scale;
  const fx = Math.min(D.feet.x, D.rightMargin - (art.w - art.feet[0]) * S);
  const left = fx - art.feet[0] * S;
  const top = D.feet.y - (art.feet[1] + 1) * S;
  return {
    x: left + (art.w * S) / 2,
    y: top + (art.h * S) / 2,
    w: art.w * S,
    h: art.h * S,
    feet: { x: fx, y: D.feet.y },
    head: { x: left + (art.head[0] + 0.5) * S, y: top },
  };
}

export function drawEnemyUnit(ctx: CombatCtx, layer: Layer, view: BattleView): void {
  const e = view.enemy;
  const def = enemies.find((x) => x.id === e.id);
  const stand = standOf(e.id);
  ctx.drawBody(layer, e.id, def?.tier ?? "basic", stand);
  const bottom = enemyBlock(ctx, layer, view, def?.name ?? e.id, def?.tier ?? "basic");
  actionBubble(ctx, layer, view, stand, bottom);
}

// ---- the enemy's block ----

type Icon = (g: Phaser.GameObjects.Graphics, cx: number, cy: number) => void;
interface Chip { text: string; colour: string; icon: Icon; tip: { text: string; style?: "title" | "head" | "dim" }[] }

// The block's chips: the passives, then what is special about this round (the Warden's locked spark, the
// Spark Shrine's blessing).
function chipsOf(ctx: CombatCtx, view: BattleView): Chip[] {
  const out: Chip[] = view.enemy.passives.map((p: Passive) => ({
    text: p.short,
    colour: D.block.chip.colour,
    icon: (g, cx, cy) => drawPassiveIcon(ctx.scene, g, p, cx, cy, D.block.chip.iconR / 34),
    tip: [{ text: p.name, style: "title" }, ...(p.text ? [{ text: p.text }] : [])],
  }));
  if (view.locked) {
    const spark = view.locked;
    out.push({
      text: `${spark} locked this round`,
      colour: "#ffb3aa",
      icon: (g, cx, cy) => {
        drawSparkGlyph(g, spark, cx - 2, cy, 11);
        drawPadlock(ctx.scene, g, cx + 4, cy + 3, 0.45);
      },
      tip: [{ text: `${spark} locked this round`, style: "title" }, { text: `Players cannot attach to ${spark} open ends this round.` }],
    });
  }
  if (view.blessing) {
    const b = view.blessing;
    out.push({
      text: `Blessed ${b.spark}: +${b.strength}`,
      colour: "#ffe14d",
      icon: (g, cx, cy) => {
        drawBlessedGlow(g, b.spark, cx, cy, 11);
        drawSparkGlyph(g, b.spark, cx, cy, 11);
      },
      tip: [{ text: `Blessed ${b.spark}: +${b.strength}`, style: "title" }, { text: `Every domino attached to the blessed ${b.spark} spark adds +${b.strength} charge.` }],
    });
  }
  return out;
}

// The width in px of a text in a role, for sizing a plate before it is drawn.
function textWidth(scene: Phaser.Scene, text: string, size: number): number {
  const t = scene.add.text(0, 0, text, { ...fontRole(size) });
  const w = t.width;
  t.destroy();
  return w;
}

// The enemy block, top right: one kit plate holding the tier tag and name, the chips (they wrap), the
// health bar with the enemy's block beside it, and the line as a number (a later issue turns it into a bar).
// Returns the y of its bottom edge.
function enemyBlock(ctx: CombatCtx, layer: Layer, view: BattleView, name: string, tier: string): number {
  const B = D.block;
  const e = view.enemy;
  const back = ctx.gfx(layer); // the plate: drawn last, once its height is known, but under everything else
  const innerX = B.x + B.padX;
  const innerW = B.w * U - 2 * B.padX;
  let y = B.y + B.padTop;

  // The tier tag and the name.
  const tagG = ctx.gfx(layer);
  const tag = ctx.label(layer, 0, y + B.name.h / 2, tier.toUpperCase(), B.tier.textRole, B.tier.text, 0);
  const tagW = Math.ceil(tag.width / U) + 2 * B.tier.padX;
  const tagColour = (B.tier.colours as Record<string, string>)[tier] ?? B.tier.colours.basic;
  drawPlate(tagG, innerX, y + (B.name.h - B.tier.h * U) / 2, tagW, B.tier.h, tagColour);
  tag.setPosition(Math.round(innerX + (tagW * U) / 2 - tag.width / 2), Math.round(y + B.name.h / 2 - 2)).setOrigin(0, 0.5);
  const nameX = innerX + tagW * U + B.name.gap;
  const title = ctx.label(layer, nameX, y + B.name.h / 2, name, B.name.size, B.name.colour, 0);
  fitText(title, innerX + innerW - nameX);
  y += B.name.h;

  // The chips, left to right, wrapping at the block's inner edge.
  const C = B.chip;
  const chips = chipsOf(ctx, view);
  const ch = C.h * U;
  let cx = innerX;
  let row = 0;
  for (const c of chips) {
    const w = Math.min(innerW, Math.ceil((2 * C.padX + 2 * C.iconR + 8 + textWidth(ctx.scene, c.text, C.size)) / U) * U);
    if (cx > innerX && cx + w > innerX + innerW) {
      cx = innerX;
      row++;
    }
    const cy = y + B.gap + row * (ch + B.gap);
    chip(ctx, layer, cx, cy, w, c);
    cx += w + C.gapX;
  }
  if (chips.length > 0) y += B.gap + (row + 1) * ch + row * B.gap;

  // The health bar, with the enemy's block (a shield and its number) beside it; the line under it.
  y += B.gap;
  const barW = B.bar.w * U;
  ctx.bar(layer, "enemy", innerX, y, B.bar.w, B.bar.kind as "health", e.health, e.maxHealth);
  const barH = presentation.kit.bar.height * U;
  ctx.shield(layer, "enemy", innerX + barW + B.bar.shield.dx, y + barH / 2, B.bar.shield.s, e.block);
  y += barH + B.gap;
  ctx.label(layer, innerX, y + B.line.h / 2, `${B.line.text} ${e.line}`, B.line.size, B.line.colour, 0);
  y += B.line.h + B.padBottom;

  const h = Math.ceil((y - B.y) / U);
  drawPlate(back, B.x, B.y, B.w, h);
  return B.y + h * U;
}

// A chip: a small kit plate with an icon and a short text; the tooltip carries the full text.
function chip(ctx: CombatCtx, layer: Layer, x: number, y: number, w: number, c: Chip): void {
  const C = D.block.chip;
  const h = C.h * U;
  const plate = ctx.gfx(layer);
  drawPlate(plate, x, y, w / U, C.h, C.edge);
  const ix = x + C.padX + C.iconR;
  const icon = ctx.gfx(layer);
  c.icon(icon, ix, y + h / 2);
  const t = ctx.label(layer, ix + C.iconR + 8, y + h / 2, c.text, C.size, c.colour, 0);
  fitText(t, x + w - C.padX - t.x);
  const z = ctx.scene.add.zone(x + w / 2, y + h / 2, w, h);
  layer.add(z);
  ctx.tooltip.attachLines(z, c.tip);
}

// ---- the action bubble ----

function intentLabel(intent: Intent): string {
  const kinds = [...new Set(intent.actions.map((a) => (a.kind === "attack" ? "attacks" : "blocks")))];
  return kinds.length === 0 ? "NEXT, IT WAITS" : `NEXT, IT ${kinds.join(" AND ").toUpperCase()}`;
}

// One intent's actions in a row (an icon, the number, ×N for several hits), centred on the container's
// origin, shrunk to fit `maxW`. `was` is the same intent before the stagger halved it: each attack it
// changed shows the old number struck through, then an arrow, then the new one ("20 → 10").
function intentRow(scene: Phaser.Scene, intent: Intent, base: number, maxW: number, was?: Intent): Phaser.GameObjects.Container {
  const A = D.action;
  const row = scene.add.container(0, 0);
  const inner = scene.add.container(0, 0);
  row.add(inner);
  let x = 0;
  intent.actions.forEach((a, i) => {
    if (i > 0) x += A.gap * 2;
    const g = scene.add.graphics().setPosition(x + 26 * A.icon, 0).setScale(A.icon);
    drawEffectIcon(g, a.kind === "attack" ? "damage" : "block");
    inner.add(g);
    x += 52 * A.icon + A.gap;
    const before = was?.actions[i];
    if (before && before.kind === "attack" && a.kind === "attack" && before.value !== a.value) {
      const old = scene.add.text(x, 0, String(before.value), { ...fontRole(A.struckSize), color: A.struckColour }).setOrigin(0, 0.5);
      const strike = scene.add.graphics();
      strike.lineStyle(5, hexColour(A.struckColour), 1);
      strike.lineBetween(x - 4, 0, x + old.width + 4, 0);
      const arrow = scene.add.text(x + old.width + A.gap, 0, A.arrow, { ...fontRole(A.arrowSize), color: A.arrowColour }).setOrigin(0, 0.5);
      inner.add([old, strike, arrow]);
      x += old.width + A.gap + arrow.width + A.gap;
    }
    const halved = before !== undefined && before.kind === "attack" && a.kind === "attack" && before.value !== a.value;
    const num = scene.add.text(x, 0, String(a.value), { ...fontRole(A.numberSize), color: halved ? A.halvedColour : "#ffffff" }).setOrigin(0, 0.5);
    inner.add(num);
    x += num.width;
    if (a.kind === "attack" && (a.hits ?? 1) > 1) {
      const hits = scene.add.text(x + 6, 8, `×${a.hits}`, { ...fontRole(A.hitsSize), color: A.hitsColour }).setOrigin(0, 0.5);
      inner.add(hits);
      x += hits.width + 6;
    }
  });
  inner.x = -x / 2;
  row.setScale(Math.min(1, maxW / Math.max(1, x * base)) * base);
  return row;
}

// What the enemy will do next, in a kit plate over its head with a tail pointing at it: the actions of
// its intent (halved beside the full ones while it is staggered) and, for Spyglass holders, the next
// rounds small, under them. It follows the head point and stays right of the circle and under the block.
function actionBubble(ctx: CombatCtx, layer: Layer, view: BattleView, stand: Stand, blockBottom: number): void {
  const Bd = D.bubble;
  const back = ctx.gfx(layer);
  // Staggered (the cascade reached the line): once the slam is in, the attack shows halved beside the full one.
  const staggered = view.enemy.staggered && !ctx.staggerHeld();
  const row = intentRow(ctx.scene, staggered ? halvedIntent(view.intent) : view.intent, 1, Bd.maxW - 2 * Bd.padX, staggered ? view.intent : undefined);
  const label = ctx.label(layer, 0, 0, intentLabel(view.intent), Bd.label.size, Bd.label.colour, 0);
  const later = view.upcomingIntents.map((intent) => intentRow(ctx.scene, intent, Bd.later.scale, 1000));
  const laterLabel = later.length > 0 ? ctx.label(layer, 0, 0, "Later", Bd.later.size, Bd.later.colour, 0) : null;
  const laterW = later.reduce((s, r) => s + r.getBounds().width + 24, 0) + (laterLabel ? laterLabel.width + 14 : 0);
  const contentW = Math.max(row.getBounds().width, label.width, laterW);
  const w = Math.max(Bd.minW, Math.min(Bd.maxW, Math.ceil((contentW + 2 * Bd.padX) / U) * U));
  const labelH = 24;
  const h = Math.ceil((Bd.padTop + labelH + Bd.gap + Bd.rowH + (later.length > 0 ? Bd.later.h : 0) + Bd.padBottom) / U) * U;
  const tail = Bd.tailRows * U;
  const x = Math.round(Math.max(Bd.left, Math.min(D.rightMargin - w, stand.head.x - w / 2)));
  const y = Math.round(Math.max(blockBottom + Bd.belowBlock, stand.head.y - Bd.tailGap - tail - h));

  drawPlate(back, x, y, w / U, h / U, Bd.edge);
  tailDown(back, Math.max(x + 3 * U, Math.min(x + w - 3 * U, stand.head.x)), y + h, Bd.tailRows, Bd.edge);
  label.setPosition(Math.round(x + w / 2 - label.width / 2), y + Bd.padTop + labelH / 2);
  snap(label);
  row.setPosition(x + w / 2, y + Bd.padTop + labelH + Bd.gap + Bd.rowH / 2);
  layer.add(row);
  if (laterLabel) {
    const cy = y + h - Bd.padBottom - Bd.later.h / 2;
    laterLabel.setPosition(x + Bd.padX, cy);
    let lx = x + Bd.padX + laterLabel.width + 14;
    later.forEach((r) => {
      const rw = r.getBounds().width;
      r.setPosition(lx + rw / 2, cy);
      layer.add(r);
      lx += rw + 24;
    });
  }
  ctx.refs().intent = { x, y, w, h };
}

// A stepped point under a plate's bottom edge, `rows` grid pixels deep, its tip at x.
function tailDown(g: Phaser.GameObjects.Graphics, x: number, bottom: number, rows: number, edge: string): void {
  const P = presentation.kit.plate;
  const cx = Math.round(x / U) * U + U / 2; // the middle of a grid pixel, so odd widths sit on the grid
  const band = (cells: number, y: number, colour: string, h = U): void => {
    g.fillStyle(hexColour(colour), 1);
    g.fillRect(cx - (cells * U) / 2, y, cells * U, h);
  };
  const open = 2 * rows - 3; // the plate's own edge and outline rows open into the tail
  band(open, bottom - 2 * U, P.fill, 2 * U);
  for (let r = 0; r < rows; r++) {
    const inner = open - 2 * r; // the fill width of this row (-1 at the tip)
    const y = bottom + r * U;
    band(inner + 4, y, P.outline);
    band(inner + 2, y, edge);
    if (inner > 0) band(inner, y, P.fill);
  }
}
