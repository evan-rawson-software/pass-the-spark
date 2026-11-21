import Phaser from "phaser";
import type { BattleView } from "../engine/view";
import type { Intent, Passive } from "../engine/types";
import { drawEffectIcon, drawSparkGlyph } from "./dominoDrawing";
import { drawPadlock, drawPassiveIcon } from "./passiveIcon";
import { drawBlessedGlow } from "./sparkShrineArt";
import { combatLayoutData, hexColour } from "./presentation";
import { enemies } from "./devBattle";
import type { CombatCtx, Layer } from "./combatCtx";
import { fitText } from "./combatCtx";
import type { ColumnLayout } from "./columnLayout";

// The enemy card at the top of the left column (#231, Spotlight; built in #228): the portrait in a
// framed card with the tier chip, the name, passive chips (full text on hover), the health bar with
// the enemy's block to its left, then the intent panel with the round chips and any later intents
// under it. Layout only: every value is from the view; sizes are in data/presentation.json
// (combatLayout.enemy) and the places come from columnLayout.ts.

const D = combatLayoutData.enemy;
const RED = 0xe0443e;
const FONT = "Arial, Helvetica, sans-serif";

export function drawEnemyUnit(ctx: CombatCtx, layer: Layer, view: BattleView, col: ColumnLayout): void {
  const e = view.enemy;
  const def = enemies.find((x) => x.id === e.id);

  // The card: a dark red backdrop with a soft light behind the portrait.
  const K = D.card;
  const g = ctx.gfx(layer);
  g.fillStyle(hexColour(K.fill), 1);
  g.fillRoundedRect(col.x, col.card.y, col.w, col.card.h, K.r);
  for (let i = 3; i >= 1; i--) {
    g.fillStyle(hexColour(K.glow), 0.22);
    g.fillEllipse(col.x + col.w / 2, col.card.y + col.card.h / 2, (col.w - 2 * K.r) * (i / 3), (col.card.h - 8) * (i / 3 + 0.25));
  }
  g.lineStyle(K.strokeWidth, hexColour(K.stroke), 1);
  g.strokeRoundedRect(col.x, col.card.y, col.w, col.card.h, K.r);
  const size = Math.min(col.w, col.card.h - 2 * K.artPad);
  ctx.drawBody(layer, e.id, def?.tier ?? "basic", { x: col.x + col.w / 2, y: col.card.y + col.card.h / 2 + K.artDy, size });

  if (def) {
    const T = D.tier;
    const t = ctx.label(layer, col.x + T.x + T.padX, col.card.y + T.y + T.h / 2, def.tier.toUpperCase(), T.size, T.colour, 0, true);
    t.setLetterSpacing(T.spacing);
    const w = t.width + 2 * T.padX;
    const pill = ctx.gfx(layer);
    pill.fillStyle(hexColour(T.fill), 0.92);
    pill.fillRoundedRect(col.x + T.x, col.card.y + T.y, w, T.h, T.h / 2);
    pill.lineStyle(2, hexColour(T.stroke), 0.8);
    pill.strokeRoundedRect(col.x + T.x, col.card.y + T.y, w, T.h, T.h / 2);
    layer.bringToTop(t);
  }

  // The name; a long name shrinks to fit. Passive chips stack under it and show the passive's `short` text.
  const title = ctx.label(layer, col.x, col.name.y + D.name.h / 2, def?.name ?? e.id, D.name.size, D.name.colour, 0, true);
  fitText(title, col.w);
  e.passives.forEach((p, i) => passiveChip(ctx, layer, p, col.x, col.chipsY + i * (D.chip.h + D.chip.gap), col.w));

  // The health bar, with the enemy's block (a shield and its number) to its left.
  const bx = col.x + D.bar.left;
  ctx.bar(layer, "enemy", bx, col.bar.y, col.w - D.bar.left, D.bar.h, e.health, e.maxHealth, RED, D.bar.fontSize);
  ctx.shield(layer, "enemy", col.x + D.shield.x, col.bar.y + D.bar.h / 2, D.shield.s, e.block);

  intentPanel(ctx, layer, view, col);
  roundChips(ctx, layer, view, col);
  laterIntents(ctx, layer, view, col);
}

type Icon = (g: Phaser.GameObjects.Graphics, cx: number, cy: number) => void;

// A chip: a dark pill with an icon and a short text. The tooltip carries the full text.
function chip(ctx: CombatCtx, layer: Layer, x: number, y: number, w: number, text: string, colour: string, icon: Icon, tip: { text: string; style?: "title" | "head" | "dim" }[]): void {
  const h = D.chip.h;
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

function passiveChip(ctx: CombatCtx, layer: Layer, p: Passive, x: number, y: number, w: number): void {
  const k = D.chip.iconR / 34;
  chip(ctx, layer, x, y, w, p.short, D.chip.textColour, (g, cx, cy) => drawPassiveIcon(ctx.scene, g, p, cx, cy, k), [
    { text: p.name, style: "title" },
    ...(p.text ? [{ text: p.text }] : []),
  ]);
}

// Chips for what is special about this round: the Warden's locked spark and the Spark Shrine's
// blessing. They sit under the intent panel, one per row.
function roundChips(ctx: CombatCtx, layer: Layer, view: BattleView, col: ColumnLayout): void {
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
  items.forEach((it, i) => chip(ctx, layer, col.x, col.roundY + i * (D.chip.h + D.chip.gap), col.w, it.text, it.colour, it.icon, [{ text: it.text, style: "title" }, { text: it.tip }]));
}

// ---- the intent panel ----

function intentLabel(intent: Intent): string {
  const kinds = [...new Set(intent.actions.map((a) => (a.kind === "attack" ? "attacks" : "blocks")))];
  return kinds.length === 0 ? "NEXT, IT WAITS" : `NEXT, IT ${kinds.join(" AND ").toUpperCase()}`;
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

function intentPanel(ctx: CombatCtx, layer: Layer, view: BattleView, col: ColumnLayout): void {
  const B = D.intent;
  const { y, h } = col.intent;
  const g = ctx.gfx(layer);
  g.fillStyle(hexColour(B.fill), 1);
  g.fillRoundedRect(col.x, y, col.w, h, B.r);
  g.lineStyle(B.strokeWidth, hexColour(B.stroke), 1);
  g.strokeRoundedRect(col.x, y, col.w, h, B.r);
  const row = intentRow(ctx.scene, view.intent, 1, col.w - 2 * D.action.pad).setPosition(col.x + col.w / 2, y + B.rowY);
  layer.add(row);
  const L = D.label;
  ctx.label(layer, col.x + col.w / 2, y + B.labelY, intentLabel(view.intent), L.size, L.colour, 0.5, true).setLetterSpacing(L.spacing);
  ctx.refs().intent = { x: col.x, y, w: col.w, h };
}

// Spyglass holders also see the next rounds, small, in a row under the panel.
function laterIntents(ctx: CombatCtx, layer: Layer, view: BattleView, col: ColumnLayout): void {
  if (view.upcomingIntents.length === 0) return;
  const U = D.later;
  const cy = col.laterY + U.h / 2;
  const label = ctx.label(layer, col.x, cy, "Later", U.size, U.colour, 0, true);
  let x = col.x + label.width + 14;
  for (const intent of view.upcomingIntents) {
    const r = intentRow(ctx.scene, intent, U.scale, 1000);
    const w = r.getBounds().width;
    r.setPosition(x + w / 2, cy);
    layer.add(r);
    x += w + 24;
  }
}
