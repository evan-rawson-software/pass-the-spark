import Phaser from "phaser";
import { ENEMY_SEAT, getPendingChoice, previewPlay } from "../engine/battle";
import type { BattleState } from "../engine/battle";
import { getView } from "../engine/view";
import type { BattleView } from "../engine/view";
import type { Domino, Passive } from "../engine/types";
import { drawDomino, drawSparkGlyph } from "./dominoDrawing";
import type { DominoState } from "./dominoDrawing";
import { Tooltip } from "./tooltip";
import { dominoes, enemies, startPlaceholderBattle } from "./devBattle";

// The combat table. Draws everything from getView (and getPendingChoice for
// whose turn it is and which dominoes are playable). No rules live here.
// No interaction (#24) or animation (#25) yet. Tooltips come from tooltip.ts.

type Layer = Phaser.GameObjects.Container;

const DW = 240; // a domino at scale 1 (see dominoDrawing.ts)
const DH = 120;
const FONT = "Arial, Helvetica, sans-serif";
const COMBO_METER_FULL = 60; // strength x lap at which the meter looks full (cosmetic only)

// Table regions (1920x1080).
const MAT = { x: 370, y: 400, w: 1180, h: 360 }; // the chain
const HAND = { x: 370, y: 785, w: 1180, h: 265 }; // the active hand
const LEFT_X = 30;
const RIGHT_X = 1565;
const SIDE_W = 310;
const SIDE_TOP = 330;
const SIDE_H = 450;

const GOLD = 0xffe14d;
const RED = 0xe0443e;

export class CombatScene extends Phaser.Scene {
  private state!: BattleState;
  private layer?: Layer;
  private tooltip!: Tooltip;
  private tipPlayer = ""; // whose playable dominoes get an "if played now" preview

  constructor() {
    super("combat");
  }

  create(): void {
    this.drawTable();
    this.tooltip = new Tooltip(this);
    this.setState(startPlaceholderBattle(new URLSearchParams(window.location.search)));
  }

  // The one entry point for new state: later issues call this after each step.
  setState(state: BattleState): void {
    this.state = state;
    this.redraw();
  }

  // ---- the one redraw ----

  private redraw(): void {
    this.tooltip.hide();
    this.layer?.destroy(true);
    const layer = this.add.container(0, 0);
    this.layer = layer;
    const state = this.state;
    const view = getView(state, state.players[0].id);
    const pending = getPendingChoice(state);
    const playable = new Set<string>(
      pending === null ? [] : pending.type === "fuse" ? pending.dominoes : pending.options.map((o) => o.domino),
    );
    const active = state.seat === ENEMY_SEAT ? state.lead : state.seat;
    this.tipPlayer = pending === null ? "" : pending.player;

    this.drawEnemy(layer, view);
    this.drawHud(layer, view);
    this.drawParty(layer, view);
    this.drawChain(layer, view);
    this.drawActiveHand(layer, view, active, playable, pending?.type ?? null);
    const others = view.players.filter((p) => p.id !== active);
    others.forEach((p, i) => {
      // Left column takes the 1st and 3rd teammate, the right column the 2nd.
      const left = i !== 1;
      const sharing = left && others.length > 2;
      const h = sharing ? SIDE_H / 2 : SIDE_H;
      const y = SIDE_TOP + (sharing && i === 2 ? SIDE_H / 2 : 0);
      this.drawTeammate(layer, view, p.id, left ? LEFT_X : RIGHT_X, y, h);
    });
  }

  // ---- table (drawn once) ----

  private drawTable(): void {
    const g = this.add.graphics();
    g.fillStyle(0x2e2016, 1);
    g.fillRect(0, 0, 1920, 1080);
    g.fillStyle(0x4a3322, 1);
    g.fillRoundedRect(8, 8, 1904, 1064, 150);
    g.fillStyle(0x1e5a42, 1);
    g.fillRoundedRect(28, 28, 1864, 1024, 130);
    g.lineStyle(4, 0x2f7a5b, 1);
    g.strokeRoundedRect(44, 44, 1832, 992, 116);
    // A soft pool of light and the chain mat: felt markings, not boxes.
    g.fillStyle(0x246b4f, 0.55);
    g.fillEllipse(960, 560, 1500, 700);
    g.fillStyle(0x174c38, 0.6);
    g.fillRoundedRect(MAT.x, MAT.y, MAT.w, MAT.h, 60);
    g.lineStyle(3, 0x2f7a5b, 0.7);
    g.strokeRoundedRect(MAT.x, MAT.y, MAT.w, MAT.h, 60);
  }

  // ---- small helpers ----

  private label(layer: Layer, x: number, y: number, text: string, size: number, color = "#ffffff", originX = 0, bold = false): Phaser.GameObjects.Text {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? "bold" : "normal" })
      .setOrigin(originX, 0.5);
    layer.add(t);
    return t;
  }

  private gfx(layer: Layer): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();
    layer.add(g);
    return g;
  }

  private domino(layer: Layer, id: string | null, k: number, state: DominoState, x: number, y: number): void {
    const d: Domino = dominoes.find((q) => q.id === id) ?? dominoes[0];
    const c = drawDomino(this, d, "large", state);
    c.setScale(k);
    c.setPosition(x, y);
    layer.add(c);
    // Every face-up domino has a tooltip; hidden enemy dominoes have none. Only a playable
    // domino in the active hand gets the engine's "if played now" numbers.
    if (state !== "hidden") {
      const preview = state === "playable" ? () => previewPlay(this.state, this.tipPlayer, d.id) : undefined;
      this.tooltip.attach(c, d, preview);
    }
  }

  private bar(layer: Layer, x: number, y: number, w: number, h: number, value: number, max: number, color: number, text: string): void {
    const g = this.gfx(layer);
    g.fillStyle(0x0d2a20, 0.9);
    g.fillRoundedRect(x, y, w, h, h / 2);
    const f = Math.max(0, Math.min(1, value / max));
    if (f > 0) {
      g.fillStyle(color, 1);
      g.fillRoundedRect(x, y, Math.max(h, w * f), h, h / 2);
    }
    g.lineStyle(3, 0x0d2a20, 1);
    g.strokeRoundedRect(x, y, w, h, h / 2);
    this.label(layer, x + w / 2, y + h / 2, text, Math.round(h * 0.6), "#ffffff", 0.5, true);
  }

  private shield(layer: Layer, x: number, y: number, s: number, amount: number): void {
    const g = this.gfx(layer);
    g.fillStyle(0x4a6fa5, 1);
    g.lineStyle(3, 0x1c2b44, 1);
    const pts = [[-1, -1], [1, -1], [1, 0.1], [0, 1.1], [-1, 0.1]].map(([a, b]) => new Phaser.Math.Vector2(x + a * s * 0.5, y + b * s * 0.5));
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);
    this.label(layer, x + s * 0.5 + 8, y, String(amount), Math.round(s * 0.7), "#dbe6f5", 0, true);
  }

  // A seat's name plate; the seat on turn glows.
  private plate(layer: Layer, cx: number, cy: number, text: string, onTurn: boolean, fontSize = 26): void {
    const t = this.label(layer, cx, cy, text, fontSize, onTurn ? "#2a2200" : "#ffffff", 0.5, true);
    const w = t.width + 36;
    const h = fontSize + 18;
    const g = this.add.graphics();
    if (onTurn) {
      for (let i = 4; i >= 1; i--) {
        g.lineStyle(i * 5, GOLD, 0.14);
        g.strokeRoundedRect(cx - w / 2 - i * 2, cy - h / 2 - i * 2, w + i * 4, h + i * 4, h / 2 + i * 2);
      }
    }
    g.fillStyle(onTurn ? GOLD : 0x0d2a20, 0.95);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
    layer.add(g);
    layer.bringToTop(t);
  }

  // ---- enemy (top) ----

  private drawEnemy(layer: Layer, view: BattleView): void {
    const e = view.enemy;
    const def = enemies.find((x) => x.id === e.id);
    const onTurn = view.seat === ENEMY_SEAT;
    if (onTurn) {
      const g = this.gfx(layer);
      for (let i = 5; i >= 1; i--) {
        g.lineStyle(i * 5, GOLD, 0.12);
        g.strokeRoundedRect(60 - i * 2, 30 - i * 2, 1480 + i * 4, 270 + i * 4, 60 + i * 2);
      }
    }
    this.label(layer, 60, 62, def?.name ?? e.id, 48, onTurn ? "#ffe14d" : "#ffffff", 0, true);
    if (def) this.label(layer, 60, 108, def.tier.toUpperCase(), 20, "#9fd1b8", 0, true);
    this.bar(layer, 60, 135, 400, 40, e.health, e.maxHealth, RED, `${e.health} / ${e.maxHealth}`);
    this.shield(layer, 80, 208, 40, e.block);
    e.passives.forEach((p, i) => this.drawPassive(layer, p, 230 + i * 130, 245));

    // The enemy's hand, oldest on the left.
    const rowX = 600;
    this.label(layer, rowX - 20, 70, "Hand", 22, "#9fd1b8", 1);
    e.hand.forEach((slot, i) => {
      const x = rowX + 60 + i * 130; // 7 slots (the largest handLimit) end at x 1500, left of the party bar
      if (slot.revealed) this.domino(layer, slot.domino, 0.5, "revealed", x, 70);
      else this.domino(layer, null, 0.5, "hidden", x, 70);
    });
    // Its whole deck, and what it has played since the last reshuffle.
    const y = this.smallRow(layer, "Deck", e.deckList, "normal", rowX, 158);
    this.smallRow(layer, "Played", e.faceUp, "playedFaceUp", rowX, y + 8);
  }

  // Small dominoes in rows that wrap. Returns the y for the row below.
  private smallRow(layer: Layer, name: string, ids: string[], state: DominoState, x: number, y: number): number {
    this.label(layer, x - 20, y, name, 22, "#9fd1b8", 1);
    if (ids.length === 0) {
      this.label(layer, x + 10, y, "none yet", 18, "#7fb59b", 0);
      return y + 34;
    }
    const perRow = 8;
    ids.forEach((id, i) => {
      this.domino(layer, id, 0.4, state, x + 50 + (i % perRow) * 104, y + Math.floor(i / perRow) * 54);
    });
    return y + Math.floor((ids.length - 1) / perRow) * 54 + 54;
  }

  private drawPassive(layer: Layer, p: Passive, x: number, y: number): void {
    const g = this.gfx(layer);
    g.fillStyle(0x0d2a20, 0.9);
    g.fillCircle(x, y, 34);
    g.lineStyle(4, GOLD, 1);
    g.strokeCircle(x, y, 34);
    if (p.kind === "auditor") {
      // A ledger page with ruled lines.
      g.fillStyle(0xf4ecd8, 1);
      g.fillRoundedRect(x - 16, y - 22, 32, 44, 4);
      g.lineStyle(3, 0x2a2a2a, 1);
      for (let i = 0; i < 4; i++) g.lineBetween(x - 10, y - 12 + i * 9, x + 10, y - 12 + i * 9);
    } else {
      // A mouth with teeth.
      g.fillStyle(0x7a1f2b, 1);
      g.fillEllipse(x, y + 2, 46, 30);
      g.fillStyle(0xffffff, 1);
      for (let i = 0; i < 4; i++) {
        g.fillTriangle(x - 18 + i * 9, y - 8, x - 10 + i * 9, y - 8, x - 14 + i * 9, y + 2);
      }
    }
    const name = p.kind.charAt(0).toUpperCase() + p.kind.slice(1);
    this.label(layer, x - 44, y, name, 24, "#ffe14d", 1, true);
  }

  // ---- HUD (band under the enemy) ----

  private drawHud(layer: Layer, view: BattleView): void {
    const y = 350;
    this.label(layer, MAT.x + 10, y, `Round ${view.round}`, 36, "#ffffff", 0, true);
    if (view.result) {
      this.label(layer, MAT.x + 10, y + 36, view.result === "won" ? "Battle won" : "Battle lost", 22, "#ffe14d", 0, true);
    }

    // Turn order around the table, enemy included, lead marked.
    const n = view.seatOrder.length;
    const step = 150;
    const x0 = 900 - ((n - 1) * step) / 2;
    const g = this.gfx(layer);
    view.seatOrder.forEach((seat, i) => {
      const x = x0 + i * step;
      this.plate(layer, x, y - 6, seat === ENEMY_SEAT ? "Enemy" : seat, seat === view.seat && view.phase !== "over", 24);
      if (seat === view.lead) this.label(layer, x, y + 28, "LEAD", 16, "#ffe14d", 0.5, true);
      if (i < n - 1) {
        g.fillStyle(0x9fd1b8, 1);
        g.fillTriangle(x + step / 2 - 6, y - 14, x + step / 2 - 6, y + 2, x + step / 2 + 6, y - 6);
      }
    });

    // The spark(s) the next domino must answer.
    this.label(layer, 1330, y - 6, "Spark", 22, "#9fd1b8", 0);
    const sg = this.gfx(layer);
    if (view.chain.sparks.length === 0) this.label(layer, 1405, y - 6, "none", 22, "#ffffff", 0);
    view.chain.sparks.forEach((s, i) => drawSparkGlyph(sg, s, 1430 + i * 56, y - 6, 22));
  }

  // ---- party health (top right) and combo meter ----

  private drawParty(layer: Layer, view: BattleView): void {
    const p = view.party;
    this.label(layer, RIGHT_X, 48, "Party", 24, "#9fd1b8", 0, true);
    this.bar(layer, RIGHT_X, 68, 190, 34, p.health, p.maxHealth, 0x3fae68, `${p.health} / ${p.maxHealth}`);
    this.shield(layer, RIGHT_X + 212, 85, 34, p.block);

    // Combo meter: strength x lap.
    const { strength, lap } = view.chain;
    const total = strength * lap;
    const x = RIGHT_X;
    const g = this.gfx(layer);
    g.fillStyle(0x174c38, 0.6);
    g.fillRoundedRect(x, 135, SIDE_W, 170, 40);
    g.lineStyle(3, 0x2f7a5b, 0.7);
    g.strokeRoundedRect(x, 135, SIDE_W, 170, 40);
    this.label(layer, x + SIDE_W / 2, 160, `STRENGTH ${strength}  ×  LAP ${lap}`, 21, "#9fd1b8", 0.5, true);
    this.label(layer, x + SIDE_W / 2, 220, String(total), 84, total > 0 ? "#ffe14d" : "#5f8f7a", 0.5, true);
    const f = Math.min(1, total / COMBO_METER_FULL);
    g.fillStyle(0x0d2a20, 1);
    g.fillRoundedRect(x + 24, 272, SIDE_W - 48, 18, 9);
    if (f > 0) {
      g.fillStyle(f < 0.5 ? 0xf2c200 : f < 0.85 ? 0xff8a1f : 0xff3b2f, 1);
      g.fillRoundedRect(x + 24, 272, Math.max(18, (SIDE_W - 48) * f), 18, 9);
    }
  }

  // ---- the chain (middle) ----

  private drawChain(layer: Layer, view: BattleView): void {
    const played = view.chain.played;
    const hasSlot = view.phase !== "over";
    const innerW = MAT.w - 100;
    const innerH = MAT.h - 40;
    // Largest scale at which every domino (plus the empty slot) fits.
    const scales = [0.75, 0.6, 0.5, 0.4, 0.32, 0.26];
    let k = scales[scales.length - 1];
    let perRow = 1;
    let rows = 1;
    for (const s of scales) {
      perRow = Math.floor(innerW / (DW * s));
      rows = Math.floor(innerH / (DH * s + (s >= 0.5 ? 24 : 8)));
      k = s;
      if (perRow * rows >= played.length + (hasSlot ? 1 : 0)) break;
    }
    // If it still does not fit, show the latest dominoes and say how many are off the table.
    const capacity = perRow * rows - (hasSlot ? 1 : 0);
    const hidden = Math.max(0, played.length - capacity);
    const shown = played.slice(hidden);
    const rowH = DH * k + (k >= 0.5 ? 24 : 8);
    const w = DW * k;
    const x0 = MAT.x + (MAT.w - perRow * w) / 2;
    const slots = shown.length + (hasSlot ? 1 : 0);
    const usedRows = Math.ceil(slots / perRow);
    const y0 = MAT.y + (MAT.h - usedRows * rowH) / 2 + rowH / 2 - (k >= 0.5 ? 6 : 0);
    const g = this.gfx(layer);
    const pos = (i: number) => ({ x: x0 + (i % perRow) * w + w / 2, y: y0 + Math.floor(i / perRow) * rowH });

    shown.forEach((p, i) => {
      const { x, y } = pos(i);
      const enemy = p.seat === ENEMY_SEAT;
      if (enemy) {
        g.fillStyle(RED, 0.7);
        g.fillRoundedRect(x - w / 2 - 5, y - (DH * k) / 2 - 5, w + 10, DH * k + 10, 14 * k + 5);
      }
      this.domino(layer, p.domino, k, enemy ? "playedFaceUp" : "normal", x, y);
      if (k >= 0.5) {
        const tag = (enemy ? "Enemy" : p.seat) + (i + hidden === 0 ? " (fuse)" : "");
        this.label(layer, x, y + (DH * k) / 2 + 13, tag, 16, enemy ? "#ff9a94" : "#cfe9dc", 0.5, true);
      }
      // Row breaks: a small arrow at the row's end and one at the next row's start.
      if (i % perRow === perRow - 1 && i < slots - 1) {
        const next = pos(i + 1);
        g.fillStyle(0x9fd1b8, 1);
        g.fillTriangle(x + w / 2 + 6, y - 9, x + w / 2 + 6, y + 9, x + w / 2 + 20, y);
        g.fillTriangle(next.x - w / 2 - 20, next.y - 9, next.x - w / 2 - 20, next.y + 9, next.x - w / 2 - 6, next.y);
      }
    });
    if (hidden > 0) this.label(layer, MAT.x + MAT.w / 2, MAT.y + 18, `+ ${hidden} earlier`, 18, "#9fd1b8", 0.5);

    // The empty slot where the next domino goes.
    if (hasSlot) {
      const { x, y } = pos(shown.length);
      const sh = DH * k;
      for (let i = 4; i >= 1; i--) {
        g.lineStyle(i * 6, GOLD, 0.12);
        g.strokeRoundedRect(x - w / 2 - i * 2, y - sh / 2 - i * 2, w + i * 4, sh + i * 4, 14 * k + i * 2);
      }
      g.fillStyle(GOLD, 0.12);
      g.fillRoundedRect(x - w / 2, y - sh / 2, w, sh, 14 * k);
      g.lineStyle(4, GOLD, 1);
      g.strokeRoundedRect(x - w / 2, y - sh / 2, w, sh, 14 * k);
      // The spark(s) it must answer sit in the intake half.
      const sparks = view.chain.sparks;
      if (sparks.length === 0) this.label(layer, x, y, "FUSE", Math.round(40 * k + 6), "#ffe14d", 0.5, true);
      sparks.forEach((s, i) => {
        const gy = sparks.length === 1 ? y : y + (i === 0 ? -1 : 1) * 27 * k;
        drawSparkGlyph(g, s, x - 80 * k, gy, (sparks.length === 1 ? 24 : 16) * k);
      });
    }
  }

  // ---- hands ----

  private drawActiveHand(layer: Layer, view: BattleView, active: string, playable: Set<string>, pendingType: "fuse" | "answer" | null): void {
    const p = view.players.find((x) => x.id === active);
    if (!p) return;
    const onTurn = view.phase !== "over";
    const g = this.gfx(layer);
    if (onTurn) {
      for (let i = 5; i >= 1; i--) {
        g.lineStyle(i * 5, GOLD, 0.1);
        g.strokeRoundedRect(HAND.x - i * 2, HAND.y - i * 2, HAND.w + i * 4, HAND.h + i * 4, 50 + i * 2);
      }
    }
    this.plate(layer, HAND.x + 110, HAND.y + 4, p.id, onTurn, 28);
    const hint = pendingType === "fuse" ? "Choose a domino to fuse" : pendingType === "answer" ? "Answer the spark" : "";
    this.label(layer, HAND.x + 240, HAND.y + 4, `${hint}${hint ? "   ·   " : ""}Deck ${p.deck.length}   Discard ${p.discard.length}`, 22, "#cfe9dc", 0);
    if (p.hand.length === 0) {
      this.label(layer, HAND.x + HAND.w / 2, HAND.y + 130, "No dominoes in hand", 28, "#7fb59b", 0.5);
      return;
    }
    const k = 0.8;
    const step = DW * k + 4;
    const perRow = Math.floor(HAND.w / step);
    const rows = Math.ceil(p.hand.length / perRow);
    for (let r = 0; r < rows; r++) {
      const inRow = p.hand.slice(r * perRow, (r + 1) * perRow);
      const x0 = HAND.x + (HAND.w - inRow.length * step) / 2 + step / 2;
      inRow.forEach((id, i) => {
        const state: DominoState = !onTurn ? "normal" : playable.has(id) ? "playable" : "notPlayable";
        this.domino(layer, id, k, state, x0 + i * step, HAND.y + 100 + r * (DH * k + 12));
      });
    }
  }

  private drawTeammate(layer: Layer, view: BattleView, id: string, x: number, y: number, h: number): void {
    const p = view.players.find((q) => q.id === id);
    if (!p) return;
    this.plate(layer, x + SIDE_W / 2, y + 22, p.id, false, 26);
    this.label(layer, x + SIDE_W / 2, y + 62, `Deck ${p.deck.length}   Discard ${p.discard.length}`, 20, "#cfe9dc", 0.5);
    const top = y + 90;
    const avail = h - 100;
    // Largest scale at which the whole hand fits.
    let k = 0.33;
    for (const s of [0.5, 0.4, 0.33]) {
      const per = Math.floor(SIDE_W / (DW * s + 6));
      const rows = Math.floor(avail / (DH * s + 6));
      k = s;
      if (per * rows >= p.hand.length) break;
    }
    const stepX = DW * k + 6;
    const per = Math.floor(SIDE_W / stepX);
    p.hand.forEach((did, i) => {
      const row = Math.floor(i / per);
      const inRow = Math.min(per, p.hand.length - row * per);
      const x0 = x + (SIDE_W - inRow * stepX) / 2 + stepX / 2;
      this.domino(layer, did, k, "normal", x0 + (i % per) * stepX, top + (DH * k) / 2 + row * (DH * k + 6));
    });
    if (p.hand.length === 0) this.label(layer, x + SIDE_W / 2, top + 20, "No dominoes", 20, "#7fb59b", 0.5);
  }
}
