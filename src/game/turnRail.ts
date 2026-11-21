import Phaser from "phaser";
import type { BattleView } from "../engine/view";
import type { NextPlayerPreview } from "../engine/battle";
import { drawDomino } from "./dominoDrawing";
import { charmWithTip, charmsByIds } from "./charmUi";
import { seatColour } from "./seatColours";
import { combatLayoutData, hexColour } from "./presentation";
import type { CombatCtx, Layer } from "./combatCtx";
import { fitText } from "./combatCtx";

// The seat tabs across the top of the combat screen (#231, Spotlight; the rows of #228's turn-order
// rail laid out sideways): one tab per seat in turn order, equal widths, a small arrow between them.
// Each has the seat colour, name, LEAD / YOU · NOW / NEXT / AWAY tags, charms, deck and discard
// counts and the hand as small dominoes (your own tab says "Your hand is below"). The seat on turn
// glows gold and the NEXT seat has a green outline. While a hand domino is hovered or dragged,
// setNext() lights what the NEXT seat could play after it and dims the rest (from previewNextPlayer),
// with a caption and a "pass" marker if that seat would have to pass. Hovering a small domino shows
// it full size. Layout only; positions are in data/presentation.json (combatLayout.tabs).

const D = combatLayoutData.tabs;
const DOMINO_W = 240; // a domino at scale 1 (the cell every kind fits in)
const DOMINO_H = 112; // the bar's height at scale 1

interface Tab {
  seat: string;
  box: { x: number; y: number; w: number; h: number };
  tagsLeft: number; // the left edge of the tags
  tagsY: number;
  dominoes: { id: string; x: number; y: number; k: number; c: Phaser.GameObjects.Container }[];
}

export class TurnRail {
  private tabs: Tab[] = [];
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
    this.tabs = [];
    const over = view.phase === "over";
    const seats = view.seatOrder.filter((s) => view.players.some((p) => p.id === s));
    const next = over ? null : TurnRail.nextSeat(view, turn);
    const w = (D.w - (seats.length - 1) * D.gap) / seats.length;
    seats.forEach((seat, i) => {
      const x = D.x + i * (w + D.gap);
      this.tab(layer, view, seat, x, w, { you: seat === you, lead: seat === view.lead, next: seat === next, onTurn: !over && seat === turn });
      if (i < seats.length - 1) ctx.label(layer, x + w + D.gap / 2, D.y + D.h / 2, "▸", D.arrow.size, D.arrow.colour, 0.5, true);
    });
  }

  private tab(layer: Layer, view: BattleView, seat: string, x: number, w: number, flags: { you: boolean; lead: boolean; next: boolean; onTurn: boolean }): void {
    const ctx = this.ctx;
    const s = ctx.scene;
    const y = D.y;
    const h = D.h;
    const T = D.tab;
    const player = view.players.find((p) => p.id === seat)!;
    const colour = seatColour(view.seatOrder, seat);
    const g = ctx.gfx(layer);
    if (flags.onTurn) {
      // The seat on turn glows.
      for (let i = 4; i >= 1; i--) {
        g.lineStyle(i * 5, hexColour(T.turnStroke), 0.12);
        g.strokeRoundedRect(x - i * 2, y - i * 2, w + i * 4, h + i * 4, D.r + i * 2);
      }
    }
    g.fillStyle(hexColour(flags.onTurn ? T.turnFill : T.fill), 1);
    g.fillRoundedRect(x, y, w, h, D.r);
    const stroke = flags.onTurn ? { c: T.turnStroke, w: T.turnStrokeWidth } : flags.next ? { c: T.nextStroke, w: T.nextStrokeWidth } : { c: T.stroke, w: T.strokeWidth };
    g.lineStyle(stroke.w, hexColour(stroke.c), 1);
    g.strokeRoundedRect(x, y, w, h, D.r);

    // Tags on the right of the name line, right to left; LEAD, YOU, NEXT, AWAY.
    const G = D.tags;
    const tags: { text: string; fill: string; ink: string }[] = [];
    if (flags.lead) tags.push({ text: "LEAD", fill: G.lead.fill, ink: G.lead.text });
    if (flags.you) tags.push({ text: flags.onTurn ? "YOU · NOW" : "YOU", fill: G.you.fill, ink: G.you.text });
    if (flags.next) tags.push({ text: "NEXT", fill: G.next.fill, ink: G.next.text });
    if (ctx.isAway(seat)) tags.push({ text: "AWAY", fill: G.away.fill, ink: G.away.text });
    const ty = y + G.y;
    let right = x + w - D.padX;
    for (let i = tags.length - 1; i >= 0; i--) right -= this.pill(layer, right, ty, tags[i].text, tags[i].fill, tags[i].ink) + G.gap;
    const tagsLeft = tags.length > 0 ? right + G.gap : x + w - D.padX;
    const tab: Tab = { seat, box: { x, y, w, h }, tagsLeft, tagsY: ty, dominoes: [] };
    this.tabs.push(tab);

    // The seat colour and the name, which opens the seat's deck.
    const N = D.name;
    g.fillStyle(colour, 1);
    g.fillCircle(x + D.padX + D.dot.dx, y + N.y, D.dot.r);
    const nx = x + D.padX + N.dx;
    const name = ctx.label(layer, nx, y + N.y, ctx.nameOf(seat, true, 10), N.size, N.colour, 0, true);
    fitText(name, Math.max(40, Math.min(N.maxW, tagsLeft - 10 - nx)));
    const nw = Math.min(name.width, tagsLeft - 10 - nx) + 8;
    const zone = s.add.zone(nx + nw / 2 - 4, y + N.y, nw, N.size + 10).setInteractive({ useHandCursor: true });
    zone.on("pointerdown", () => ctx.openDeck(seat));
    layer.add(zone);

    // Deck and discard counts, charms (with their hovers) at the right.
    const C = D.counts;
    const cy = y + C.y;
    const dl = ctx.label(layer, x + D.padX, cy, "deck ", C.size, C.colour, 0, false);
    const dn = ctx.label(layer, dl.x + dl.width, cy, String(player.deck.length), C.size, C.colour, 0, false);
    ctx.label(layer, dn.x + dn.width, cy, ` · discard ${player.discard.length}`, C.size, C.colour, 0, false);
    // A teammate's draw at round start flies in from their deck count here (your own deck is by your hand).
    if (!flags.you) ctx.deckSpot(layer, seat, dl.x, cy, dn);
    const K = D.charm;
    const charms = charmsByIds(player.charms);
    charms.forEach((ch, i) => {
      const px = x + w - D.padX - K.size / 2 - (charms.length - 1 - i) * K.step;
      const back = s.add.graphics();
      back.fillStyle(hexColour(K.fill), 1);
      back.fillCircle(px, cy, K.size / 2 + 2);
      layer.add(back);
      layer.add(charmWithTip(s, ctx.tooltip, ch, K.size, px, cy));
      ctx.refs().charms.set(`${seat}:${ch.id}`, { x: px, y: cy });
    });

    const Hd = D.hand;
    const top = y + Hd.top;
    const availH = h - Hd.top - Hd.bottom;
    const availW = w - 2 * D.padX;
    if (flags.you) {
      ctx.label(layer, x + w / 2, top + availH / 2, D.you.text, D.you.size, D.you.colour, 0.5, false);
      return;
    }

    // The hand as small dominoes, at the largest scale at which the whole hand fits (in rows if it must).
    const n = player.hand.length;
    let k = Hd.minScale;
    for (let s2 = Hd.maxScale; s2 >= Hd.minScale - 1e-9; s2 -= Hd.scaleStep) {
      const per = Math.floor((availW + Hd.gapX) / (DOMINO_W * s2 + Hd.gapX));
      const rows = Math.floor((availH + Hd.gapY) / (DOMINO_H * s2 + Hd.gapY));
      k = s2;
      if (per * rows >= n) break;
    }
    const stepX = DOMINO_W * k + Hd.gapX;
    const stepY = DOMINO_H * k + Hd.gapY;
    const per = Math.max(1, Math.floor((availW + Hd.gapX) / stepX));
    const rowsUsed = Math.max(1, Math.ceil(n / per));
    const slots = ctx.slots(seat);
    player.hand.forEach((id, i) => {
      const row = Math.floor(i / per);
      const inRow = Math.min(per, n - row * per);
      const px = x + D.padX + (availW - (inRow * stepX - Hd.gapX)) / 2 + (DOMINO_W * k) / 2 + (i % per) * stepX;
      const py = top + (availH - (rowsUsed * stepY - Hd.gapY)) / 2 + (DOMINO_H * k) / 2 + row * stepY;
      const c = ctx.domino(layer, id, k, "normal", px, py, undefined, { zone: "hand", seat, index: i }, seat, false);
      if (!c.input) c.setInteractive();
      c.on("pointerover", () => this.showZoom(view, id, seat, px, y + h));
      c.on("pointerout", () => this.hideZoom());
      c.on("destroy", () => this.hideZoom());
      slots[i] = { c, pos: { x: px, y: py, k } };
      tab.dominoes.push({ id, x: px, y: py, k, c });
    });
    if (n === 0) ctx.label(layer, x + w / 2, top + availH / 2, "No dominoes", D.you.size, D.you.colour, 0.5, false);
  }

  // A filled tag, its right edge at `right`. Returns its width.
  private pill(layer: Layer, right: number, y: number, text: string, fill: string, ink: string): number {
    const T = D.tags;
    const t = this.ctx.label(layer, 0, y, text, T.size, ink, 0, true);
    const w = t.width + T.padX * 2;
    const x = right - w;
    t.setX(x + T.padX);
    const g = this.ctx.gfx(layer);
    g.fillStyle(hexColour(fill), 1);
    g.fillRoundedRect(x, y - T.h / 2, w, T.h, T.h / 2);
    layer.bringToTop(t);
    return w;
  }

  // The hovered small domino at full size, just under its tab.
  private showZoom(view: BattleView, id: string, seat: string, cx: number, bottom: number): void {
    this.hideZoom();
    const Z = D.zoom;
    const d = view.dominoes.find((q) => q.id === id);
    if (!d) return;
    const dom = drawDomino(this.ctx.scene, d, "large", "normal", { owner: seatColour(view.seatOrder, seat), scale: Z.scale });
    dom.setScale(Z.scale);
    const hw = (DOMINO_W * Z.scale) / 2;
    dom.setPosition(Math.max(hw + 10, Math.min(1910 - hw, cx)), bottom + Z.gapY + (DOMINO_H * Z.scale) / 2);
    dom.setDepth(960);
    this.zoom = dom;
  }

  private hideZoom(): void {
    this.zoom?.destroy(true);
    this.zoom = undefined;
  }

  // Lights the NEXT seat's playable dominoes and dims the rest, with a caption naming the domino
  // being hovered (`after`), and a "pass" marker if that seat must pass. null puts everything back.
  setNext(p: NextPlayerPreview | null, after = ""): void {
    this.marks?.destroy(true);
    this.marks = undefined;
    for (const r of this.tabs) r.dominoes.forEach((d) => d.c.active && d.c.setAlpha(1));
    const layer = this.layer;
    if (!p || !layer?.active) return;
    const rec = this.tabs.find((r) => r.seat === p.player);
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
    const C = D.caption;
    const text = `${p.mustPass ? C.passText : C.text} ${after}`.trim();
    const cap = this.ctx.label(marks, rec.box.x + D.padX, rec.box.y + rec.box.h - C.dy, text, C.size, C.colour, 0, true);
    fitText(cap, rec.box.w - 2 * D.padX);
    if (p.mustPass) {
      // Left of the tags, on the same line.
      const T = D.tags;
      const t = this.ctx.label(marks, 0, rec.tagsY, "pass", T.size, T.pass.text, 0, true);
      const w = t.width + T.padX * 2;
      const x = rec.tagsLeft - T.gap - w;
      t.setX(x + T.padX);
      const pg = this.ctx.scene.add.graphics();
      pg.fillStyle(hexColour(T.pass.fill), 1);
      pg.fillRoundedRect(x, rec.tagsY - T.h / 2, w, T.h, T.h / 2);
      marks.add(pg);
      marks.bringToTop(t);
    }
  }
}
