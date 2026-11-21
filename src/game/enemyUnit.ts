import Phaser from "phaser";
import type { BattleView } from "../engine/view";
import type { Intent, Passive } from "../engine/types";
import { drawEffectIcon, drawSparkGlyph } from "./dominoDrawing";
import { drawNodeIcon, NODE_STYLE } from "./nodeIcon";
import { drawPadlock, drawPassiveIcon } from "./passiveIcon";
import { drawBlessedGlow } from "./sparkShrineArt";
import { combatLayoutData, hexColour } from "./presentation";
import { enemies } from "./devBattle";
import type { CombatCtx, Layer } from "./combatCtx";
import { fitText } from "./combatCtx";

// The enemy as one unit, top centre (#228, L1): portrait over a soft shadow, name and tier to its
// left, passive chips under the name (full text on hover), the intent in a speech bubble at its head,
// round chips under the bubble, the health bar and block right under it. Layout only: every value is
// from the view; positions are in data/presentation.json (combatLayout.enemy).

const D = combatLayoutData.enemy;
const RED = 0xe0443e;
const FONT = "Arial, Helvetica, sans-serif";

export function drawEnemyUnit(ctx: CombatCtx, layer: Layer, view: BattleView): void {
  const e = view.enemy;
  const def = enemies.find((x) => x.id === e.id);
  const s = ctx.scene;

  const sh = s.add.graphics();
  sh.fillStyle(0x000000, D.shadow.alpha);
  sh.fillEllipse(D.shadow.x, D.shadow.y, D.shadow.rx * 2, D.shadow.ry * 2);
  layer.add(sh);
  ctx.drawBody(layer, e.id, def?.tier ?? "basic");

  // Name, right-aligned to the portrait's left; a long name shrinks rather than run into either side.
  const title = ctx.label(layer, D.name.right, D.name.y, def?.name ?? e.id, D.name.size, D.name.colour, 1, true);
  fitText(title, D.name.maxW);
  if (def) {
    const stop = def.tier === "basic" ? "fight" : def.tier;
    const g = ctx.gfx(layer);
    g.fillStyle(NODE_STYLE[stop].color, 1);
    g.fillCircle(D.tier.x, D.tier.y, D.tier.r);
    g.lineStyle(2, hexColour(D.tier.stroke), 1);
    g.strokeCircle(D.tier.x, D.tier.y, D.tier.r);
    drawNodeIcon(g, stop, D.tier.x, D.tier.y, D.tier.r);
    const hit = s.add.circle(D.tier.x, D.tier.y, D.tier.r, 0, 0);
    layer.add(hit);
    ctx.tooltip.attachLines(hit, [{ text: def.tier === "basic" ? "Normal enemy" : NODE_STYLE[stop].name, style: "title" }]);
  }

  // Passive chips stack under the name; the chip shows the passive's `short` text.
  e.passives.forEach((p, i) => passiveChip(ctx, layer, p, D.chip.x, D.chip.y + i * (D.chip.h + D.chip.gap)));

  intentBubble(ctx, layer, view);
  roundChips(ctx, layer, view);

  const b = D.bar;
  ctx.bar(layer, "enemy", b.x, b.y, b.w, b.h, e.health, e.maxHealth, RED, b.fontSize);
  ctx.shield(layer, "enemy", D.shield.x, D.shield.y, D.shield.s, e.block);
}

type Icon = (g: Phaser.GameObjects.Graphics, cx: number, cy: number) => void;

// A chip: a dark pill with an icon and a short text. The tooltip carries the full text.
function chip(ctx: CombatCtx, layer: Layer, x: number, y: number, w: number, h: number, text: string, colour: string, icon: Icon, tip: { text: string; style?: "title" | "head" | "dim" }[]): void {
  const g = ctx.gfx(layer);
  g.fillStyle(hexColour(D.chip.fill), 1);
  g.fillRoundedRect(x, y, w, h, h / 2);
  g.lineStyle(2, hexColour(D.chip.stroke), 1);
  g.strokeRoundedRect(x, y, w, h, h / 2);
  const ix = x + h / 2 + 2;
  icon(g, ix, y + h / 2);
  const t = ctx.label(layer, ix + D.chip.iconR + 10, y + h / 2, text, D.chip.size, colour, 0, true);
  fitText(t, x + w - 16 - t.x);
  const z = ctx.scene.add.zone(x + w / 2, y + h / 2, w, h);
  layer.add(z);
  ctx.tooltip.attachLines(z, tip);
}

function passiveChip(ctx: CombatCtx, layer: Layer, p: Passive, x: number, y: number): void {
  const k = D.chip.iconR / 34;
  chip(ctx, layer, x, y, D.chip.w, D.chip.h, p.short, D.chip.textColour, (g, cx, cy) => drawPassiveIcon(ctx.scene, g, p, cx, cy, k), [
    { text: p.name, style: "title" },
    ...(p.text ? [{ text: p.text }] : []),
  ]);
}

// Chips for what is special about this round: the Warden's locked spark and the Spark Shrine's
// blessing. They sit under the intent bubble and run left to right, wrapping when the row is full.
function roundChips(ctx: CombatCtx, layer: Layer, view: BattleView): void {
  const R = D.roundChip;
  const items: { text: string; colour: string; icon: Icon; tip: string }[] = [];
  if (view.locked) {
    const spark = view.locked;
    items.push({
      text: `${spark} locked this round`,
      colour: "#ffb3aa",
      icon: (g, cx, cy) => {
        drawSparkGlyph(g, spark, cx - 2, cy, 11);
        drawPadlock(ctx.scene, g, cx + 4, cy + 3, 0.45);
      },
      tip: `Players cannot attach to ${spark} open ends this round.`,
    });
  }
  if (view.blessing) {
    const b = view.blessing;
    items.push({
      text: `Blessed ${b.spark}: +${b.strength}`,
      colour: "#ffe14d",
      icon: (g, cx, cy) => {
        drawBlessedGlow(g, b.spark, cx, cy, 11);
        drawSparkGlyph(g, b.spark, cx, cy, 11);
      },
      tip: `Every domino attached to the blessed ${b.spark} spark adds +${b.strength} charge.`,
    });
  }
  const perRow = Math.max(1, Math.floor((1900 - R.x + R.gap) / (R.w + R.gap)));
  items.forEach((it, i) => {
    const x = R.x + (i % perRow) * (R.w + R.gap);
    const y = R.y + Math.floor(i / perRow) * (R.h + R.gap);
    chip(ctx, layer, x, y, R.w, R.h, it.text, it.colour, it.icon, [{ text: it.text, style: "title" }, { text: it.tip }]);
  });
}

// ---- the intent bubble ----

function intentLabel(intent: Intent): string {
  const kinds = [...new Set(intent.actions.map((a) => (a.kind === "attack" ? "Attack" : "Block")))];
  return kinds.length === 0 ? "INTENT" : `INTENT · ${kinds.join(" + ").toUpperCase()}`;
}

// One intent's actions in a row (an icon, the number, ×N for several hits), centred on the container's
// origin, shrunk to fit `maxW`.
function intentRow(scene: Phaser.Scene, intent: Intent, base: number, maxW: number): Phaser.GameObjects.Container {
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
    const num = scene.add.text(x, 0, String(a.value), { fontFamily: FONT, fontSize: `${A.numberSize}px`, color: "#ffffff", fontStyle: "bold" }).setOrigin(0, 0.5);
    inner.add(num);
    x += num.width;
    if (a.kind === "attack" && (a.hits ?? 1) > 1) {
      const hits = scene.add.text(x + 6, 8, `×${a.hits}`, { fontFamily: FONT, fontSize: `${A.hitsSize}px`, color: A.hitsColour, fontStyle: "bold" }).setOrigin(0, 0.5);
      inner.add(hits);
      x += hits.width + 6;
    }
  });
  inner.x = -x / 2;
  row.setScale(Math.min(1, maxW / Math.max(1, x * base)) * base);
  return row;
}

function intentBubble(ctx: CombatCtx, layer: Layer, view: BattleView): void {
  const B = D.bubble;
  const s = ctx.scene;
  const g = ctx.gfx(layer);
  const fill = hexColour(B.fill);
  const stroke = hexColour(B.stroke);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(B.x, B.y, B.w, B.h, B.r);
  g.lineStyle(B.strokeWidth, stroke, 1);
  g.strokeRoundedRect(B.x, B.y, B.w, B.h, B.r);
  // The tail points left, to the portrait's head: it covers the bubble's edge, then its two sides are stroked.
  const T = B.tail;
  g.fillStyle(fill, 1);
  g.fillTriangle(B.x + B.strokeWidth, T.fromY, T.tipX, T.tipY, B.x + B.strokeWidth, T.toY);
  g.lineBetween(B.x, T.fromY, T.tipX, T.tipY);
  g.lineBetween(T.tipX, T.tipY, B.x, T.toY);

  const A = D.action;
  const row = intentRow(s, view.intent, 1, B.w - 2 * A.pad).setPosition(B.x + B.w / 2, B.y + B.h / 2);
  layer.add(row);
  const L = D.label;
  const label = ctx.label(layer, B.x + B.w / 2, L.y, intentLabel(view.intent), L.size, L.colour, 0.5, true);
  label.setLetterSpacing(L.spacing);
  ctx.refs().intent = { x: B.x, y: B.y, w: B.w, h: L.y + L.size - B.y };

  // Spyglass holders also see the next rounds, small, to the right of the bubble.
  if (view.upcomingIntents.length > 0) {
    const U = D.later;
    ctx.label(layer, U.x, U.y - 26, "Later", U.size, U.colour, 0, true);
    let x = U.x;
    for (const intent of view.upcomingIntents) {
      const r = intentRow(s, intent, U.scale, 1000);
      const w = r.getBounds().width;
      r.setPosition(x + w / 2, U.y);
      layer.add(r);
      x += w + 24;
    }
  }
}
