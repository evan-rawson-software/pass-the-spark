import Phaser from "phaser";
import type { BattleView } from "../engine/view";
import type { NextPlayerPreview } from "../engine/battle";
import { drawDomino } from "./dominoDrawing";
import { charmWithTip, charmsByIds } from "./charmUi";
import { seatColour } from "./seatColours";
import { combatLayoutData, hexColour } from "./presentation";
import type { CombatCtx, Layer } from "./combatCtx";
import { fitText } from "./combatCtx";

// The turn-order rail down the left (#228, L3): every seat in turn order with its seat colour, name,
// LEAD / YOU / NEXT tags, charms, deck and discard counts and its hand as small dominoes (your own
// seat says "Your hand is below"). The seat on turn glows. While a hand domino is hovered or dragged,
// setNext() lights what the NEXT seat could play after it and dims the rest (from previewNextPlayer),
// with a "pass" marker if that seat would have to pass. Layout only; positions are in
// data/presentation.json (combatLayout.rail).

const D = combatLayoutData.rail;
const PANEL = combatLayoutData.panel;
const DOMINO_W = 240; // a domino at scale 1 (the cell every kind fits in)
const DOMINO_H = 112; // the bar's height at scale 1

interface SeatRows {
  seat: string;
  box: { x: number; y: number; w: number; h: number };
  tagsY: number;
  dominoes: { id: string; x: number; y: number; k: number; c: Phaser.GameObjects.Container }[];
}

// The panel behind the rail and the utilities pill: one fill and stroke for both.
export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r: number): void {
  g.fillStyle(hexColour(PANEL.fill), PANEL.fillAlpha);
  g.fillRoundedRect(x, y, w, h, r);
  g.lineStyle(PANEL.strokeWidth, hexColour(PANEL.stroke), 1);
  g.strokeRoundedRect(x, y, w, h, r);
}

export class TurnRail {
  private rows: SeatRows[] = [];
  private layer?: Layer;
  private marks?: Phaser.GameObjects.Container;
  private zoom?: Phaser.GameObjects.Container;

  constructor(private ctx: CombatCtx) {}

  // The seat after `turn` in the seat order: who plays next.
  static nextSeat(view: BattleView, turn: string): string {
    const o = view.seatOrder;
    return o[(o.indexOf(turn) + 1) % o.length];
  }

  // `you` is the seat whose hand is in front; `turn` the seat on turn.
  draw(layer: Layer, view: BattleView, you: string, turn: string): void {
    const ctx = this.ctx;
    this.layer = layer;
    this.marks = undefined;
    this.hideZoom();
    this.rows = [];
    const over = view.phase === "over";
    const P = D.panel;
    const g = ctx.gfx(layer);
    drawPanel(g, P.x, P.y, P.w, P.h, P.r);
    const H = D.header;
    ctx.label(layer, H.x, H.y, H.text, H.size, H.colour, 0, true).setLetterSpacing(H.spacing);

    const next = over ? null : TurnRail.nextSeat(view, turn);
    let y = D.rowsTop;
    for (const seat of view.seatOrder) {
      const player = view.players.find((p) => p.id === seat);
      if (!player) continue;
      const h = seat === you ? D.youRowH : D.handRowH;
      this.row(layer, view, seat, y, h, { you: seat === you, lead: seat === view.lead, next: seat === next, onTurn: !over && seat === turn });
      y += h + D.gap;
    }
  }

  private row(layer: Layer, view: BattleView, seat: string, y: number, h: number, flags: { you: boolean; lead: boolean; next: boolean; onTurn: boolean }): void {
    const ctx = this.ctx;
    const s = ctx.scene;
    const R = D.row;
    const x = D.rowX;
    const w = D.rowW;
    const player = view.players.find((p) => p.id === seat)!;
    const colour = seatColour(view.seatOrder, seat);
    const g = ctx.gfx(layer);
    if (flags.onTurn) {
      // The seat on turn glows.
      for (let i = 4; i >= 1; i--) {
        g.lineStyle(i * 5, hexColour(R.turnStroke), 0.12);
        g.strokeRoundedRect(x - i * 2, y - i * 2, w + i * 4, h + i * 4, D.rowR + i * 2);
      }
    }
    g.fillStyle(hexColour(flags.onTurn ? R.turnFill : R.fill), 1);
    g.fillRoundedRect(x, y, w, h, D.rowR);
    g.lineStyle(flags.onTurn ? R.turnStrokeWidth : R.strokeWidth, hexColour(flags.onTurn ? R.turnStroke : R.stroke), 1);
    g.strokeRoundedRect(x, y, w, h, D.rowR);
    // The seat colour as an edge down the left of the row.
    g.fillStyle(colour, 1);
    g.fillRoundedRect(x, y, R.edge, h, { tl: D.rowR, bl: D.rowR, tr: 0, br: 0 });

    // The name opens the seat's deck.
    const N = D.name;
    const name = ctx.label(layer, N.x, y + N.y, ctx.nameOf(seat, true, 10), N.size, N.colour, 0, true);
    fitText(name, N.maxW);
    const zone = s.add.zone(N.x + Math.min(name.width, N.maxW) / 2, y + N.y, Math.min(name.width, N.maxW) + 8, N.size + 10).setInteractive({ useHandCursor: true });
    zone.on("pointerdown", () => ctx.openDeck(seat));
    layer.add(zone);

    // Charms on the right of the name line, with their hovers.
    const C = D.charm;
    const charms = charmsByIds(player.charms);
    const lastX = C.right - C.size / 2;
    const step = Math.min(C.step, charms.length > 1 ? (C.areaW - C.size) / (charms.length - 1) : C.step);
    charms.forEach((ch, i) => {
      const cx = lastX - (charms.length - 1 - i) * step;
      const cy = y + N.y;
      const back = s.add.graphics();
      back.fillStyle(hexColour(C.fill), 1);
      back.fillCircle(cx, cy, C.size / 2 + 2);
      layer.add(back);
      layer.add(charmWithTip(s, ctx.tooltip, ch, C.size, cx, cy));
      ctx.refs().charms.set(`${seat}:${ch.id}`, { x: cx, y: cy });
    });

    // Tags on the line below the name.
    const tags: { text: string; colour: string }[] = [];
    if (flags.lead) tags.push({ text: "LEAD", colour: D.tags.lead });
    if (flags.you) tags.push({ text: "YOU", colour: D.tags.you });
    if (flags.next) tags.push({ text: "NEXT", colour: D.tags.next });
    if (ctx.isAway(seat)) tags.push({ text: "AWAY", colour: D.tags.away });
    let tx = D.tags.x;
    const ty = y + D.tags.y;
    for (const t of tags) tx += this.pill(layer, tx, ty, t.text, t.colour) + D.tags.gap;
    const rec: SeatRows = { seat, box: { x, y, w, h }, tagsY: ty, dominoes: [] };
    this.rows.push(rec);

    // The footer: deck (a small stack with its count) and discard. Your own seat's deck pile is by your hand.
    const F = D.footer;
    const fy = y + h - F.y;
    if (flags.you) {
      ctx.label(layer, N.x, fy, `Deck ${player.deck.length} · Discard ${player.discard.length}`, F.size, F.colour, 0, false);
      const Y = D.youText;
      ctx.label(layer, Y.x, y + Y.y, Y.line1, Y.size, Y.colour, 0, false);
      const n = player.hand.length;
      ctx.label(layer, Y.x, y + Y.y + Y.lineGap, `${n} domino${n === 1 ? "" : "es"}`, Y.size, Y.colour, 0, false);
      return;
    }
    ctx.label(layer, N.x, fy, "Deck", F.size, F.colour, 0, false);
    ctx.deckStack(layer, seat, F.deckX, fy, player.deck.length);
    ctx.label(layer, F.discardX, fy, `Discard ${player.discard.length}`, F.size, F.colour, 0, false);

    // The hand as small dominoes, in rows, at the largest scale at which the whole hand fits.
    const Hd = D.hand;
    const top = y + Hd.top;
    const availH = h - Hd.top - Hd.bottom;
    const n = player.hand.length;
    let k = Hd.minScale;
    for (let s2 = Hd.maxScale; s2 >= Hd.minScale - 1e-9; s2 -= Hd.scaleStep) {
      const per = Math.floor((Hd.w + Hd.gapX) / (DOMINO_W * s2 + Hd.gapX));
      const rows = Math.floor((availH + Hd.gapY) / (DOMINO_H * s2 + Hd.gapY));
      k = s2;
      if (per * rows >= n) break;
    }
    const stepX = DOMINO_W * k + Hd.gapX;
    const stepY = DOMINO_H * k + Hd.gapY;
    const per = Math.max(1, Math.floor((Hd.w + Hd.gapX) / stepX));
    const slots = ctx.slots(seat);
    player.hand.forEach((id, i) => {
      const row = Math.floor(i / per);
      const inRow = Math.min(per, n - row * per);
      const px = Hd.x + (Hd.w - inRow * stepX) / 2 + stepX / 2 + (i % per) * stepX;
      const py = top + (DOMINO_H * k) / 2 + row * stepY;
      const c = ctx.domino(layer, id, k, "normal", px, py, undefined, { zone: "hand", seat, index: i }, seat, false);
      if (!c.input) c.setInteractive();
      c.on("pointerover", () => this.showZoom(view, id, seat, py));
      c.on("pointerout", () => this.hideZoom());
      c.on("destroy", () => this.hideZoom());
      slots[i] = { c, pos: { x: px, y: py, k } };
      rec.dominoes.push({ id, x: px, y: py, k, c });
    });
    if (n === 0) ctx.label(layer, Hd.x + Hd.w / 2, top + 24, "No dominoes", Y_EMPTY.size, Y_EMPTY.colour, 0.5, false);
  }

  // A tag: an outline-only pill after the name. Returns its width.
  private pill(layer: Layer, x: number, y: number, text: string, colour: string): number {
    const T = D.tags;
    const t = this.ctx.label(layer, x + T.padX, y, text, T.size, colour, 0, true);
    const w = t.width + T.padX * 2;
    const g = this.ctx.gfx(layer);
    g.lineStyle(2, hexColour(colour), 1);
    g.strokeRoundedRect(x, y - T.h / 2, w, T.h, T.h / 2);
    layer.bringToTop(t);
    return w;
  }

  // The hovered small domino at full size, beside the rail.
  private showZoom(view: BattleView, id: string, seat: string, y: number): void {
    this.hideZoom();
    const Z = D.zoom;
    const d = view.dominoes.find((q) => q.id === id);
    if (!d) return;
    const dom = drawDomino(this.ctx.scene, d, "large", "normal", { owner: seatColour(view.seatOrder, seat), scale: Z.scale });
    dom.setScale(Z.scale);
    const hw = (DOMINO_W * Z.scale) / 2;
    dom.setPosition(D.panel.x + D.panel.w + Z.gapX + hw, Math.max(80, Math.min(1000, y)));
    dom.setDepth(960);
    this.zoom = dom;
  }

  private hideZoom(): void {
    this.zoom?.destroy(true);
    this.zoom = undefined;
  }

  // Lights the NEXT seat's playable dominoes and dims the rest; a "pass" marker if it must pass.
  // null puts everything back.
  setNext(p: NextPlayerPreview | null): void {
    this.marks?.destroy(true);
    this.marks = undefined;
    for (const r of this.rows) r.dominoes.forEach((d) => d.c.active && d.c.setAlpha(1));
    const layer = this.layer;
    if (!p || !layer?.active) return;
    const rec = this.rows.find((r) => r.seat === p.player);
    if (!rec) return;
    const N = D.next;
    const marks = this.ctx.scene.add.container(0, 0);
    layer.add(marks);
    this.marks = marks;
    const g = this.ctx.scene.add.graphics();
    marks.add(g);
    const lit = new Set(p.playable);
    for (const d of rec.dominoes) {
      if (!d.c.active) continue;
      if (!lit.has(d.id)) {
        d.c.setAlpha(N.dimAlpha);
        continue;
      }
      const w = DOMINO_W * d.k;
      const h = DOMINO_H * d.k;
      g.lineStyle(N.glowWidth * d.k * 2, hexColour(N.glow), N.glowAlpha * 0.4);
      g.strokeRoundedRect(d.x - w / 2 - 2, d.y - h / 2 - 2, w + 4, h + 4, 6);
      g.lineStyle(Math.max(2, N.glowWidth * d.k * 0.6), hexColour(N.glow), N.glowAlpha + 0.3);
      g.strokeRoundedRect(d.x - w / 2, d.y - h / 2, w, h, 5);
    }
    if (p.mustPass) {
      // After the tags, on the same line.
      const T = D.tags;
      const t = this.ctx.label(marks, 0, rec.tagsY, "pass", T.size, T.pass, 0, true);
      const w = t.width + T.padX * 2;
      const x = rec.box.x + rec.box.w - 16 - w;
      t.setX(x + T.padX);
      const pg = this.ctx.scene.add.graphics();
      pg.fillStyle(hexColour(T.pass), 0.2);
      pg.fillRoundedRect(x, rec.tagsY - T.h / 2, w, T.h, T.h / 2);
      pg.lineStyle(2, hexColour(T.pass), 1);
      pg.strokeRoundedRect(x, rec.tagsY - T.h / 2, w, T.h, T.h / 2);
      marks.add(pg);
      marks.bringToTop(t);
    }
  }
}

const Y_EMPTY = { size: 18, colour: "#7fb59b" };
