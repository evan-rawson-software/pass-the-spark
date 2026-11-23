import Phaser from "phaser";
import type { BattleView } from "../engine/view";
import { drawDomino, dominoPixelSize } from "./dominoDrawing";
import { followUpRing, rowSlots } from "./handRow";
import { charmWithTip, charmsByIds } from "./charmUi";
import { seatColour } from "./seatColours";
import { lookOf, wizardPortrait } from "./battleWizards";
import { combatLayoutData, hexColour } from "./presentation";
import type { CombatCtx, Layer } from "./combatCtx";
import { fitText } from "./combatCtx";

// The seat tabs across the top of the combat screen (#231, Spotlight): one tab per seat in seat order,
// equal widths. There is no turn order in 0.2 (everyone builds at the same time). Each tab shows the
// seat's colour and name, a YOU tag on your own, its placements for the round as pips that fill as it
// places, a Ready mark (an away seat says "Waiting for [name]", then "Ready (away)"), charms, deck and
// discard counts (click them to open the deck and discard views; the seat in front has them in the bottom strip) and the hand as small dominoes, in a
// row that never overlaps (see rowSlots; the tab whose hand is in front says "Your hand is below"). The
// seat whose hand is in front has its tab framed in its colour. A click on a tab you may play from
// (single player: any seat; online: your own, or an away seat the host has taken over) brings its hand
// to the front. Hovering a small domino shows it full size. Layout only; positions are in
// data/presentation.json (combatLayout.tabs).

const D = combatLayoutData.tabs;
const DOMINO_W = 240; // the full-size zoom's cell (an amplifier at scale 1)
const DOMINO_H = 112; // the bar's height at scale 1

export interface TabsInput {
  front: string; // the seat whose hand is in front (its tab is framed)
  you: string; // the seat marked YOU
  pickable(seat: string): boolean; // a click on its tab brings this seat's hand to the front
  onPick(seat: string): void;
  isAway(seat: string): boolean;
  nameOf(seat: string): string; // the seat's full name, for "Waiting for [name]"
}

interface SmallDomino { id: string; x: number; y: number; w: number; h: number; c: Phaser.GameObjects.Container } // x, y: the outline's centre; w, h: its size as drawn

export class SeatTabs {
  private zoom?: Phaser.GameObjects.Container;
  private small = new Map<string, SmallDomino[]>(); // each seat's small hand dominoes as drawn (not the front seat's)
  private rings?: Phaser.GameObjects.Graphics;
  private layer?: Layer;

  constructor(private ctx: CombatCtx) {}

  draw(layer: Layer, view: BattleView, input: TabsInput): void {
    this.hideZoom();
    this.small = new Map();
    this.rings = undefined;
    this.layer = layer;
    const seats = view.seatOrder.filter((s) => view.players.some((p) => p.id === s));
    const w = (D.w - (seats.length - 1) * D.gap) / seats.length;
    seats.forEach((seat, i) => this.tab(layer, view, seat, D.x + i * (w + D.gap), w, input));
  }

  private tab(layer: Layer, view: BattleView, seat: string, x: number, w: number, input: TabsInput): void {
    const ctx = this.ctx;
    const s = ctx.scene;
    const y = D.y;
    const h = D.h;
    const T = D.tab;
    const player = view.players.find((p) => p.id === seat)!;
    const colour = seatColour(view.seatOrder, seat);
    const framed = seat === input.front;
    const away = input.isAway(seat);
    const g = ctx.gfx(layer);
    g.fillStyle(hexColour(player.ready ? T.readyFill : T.fill), 1);
    g.fillRoundedRect(x, y, w, h, D.r);
    if (framed) g.lineStyle(T.frameWidth, colour, 1);
    else g.lineStyle(T.strokeWidth, hexColour(T.stroke), 1);
    g.strokeRoundedRect(x, y, w, h, D.r);
    if (input.pickable(seat) && !framed) {
      // A click anywhere on the tab (the parts drawn after this one take their own clicks first).
      const pick = s.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true });
      pick.on("pointerdown", () => input.onPick(seat));
      layer.add(pick);
    }

    // Tags on the right of the name line, right to left: the status (Ready, or the away seat's), then YOU.
    const G = D.tags;
    const tags: { text: string; fill: string; ink: string }[] = [];
    if (seat === input.you) tags.push({ text: "YOU", fill: G.you.fill, ink: G.you.text });
    if (away) tags.push(player.ready ? { text: "Ready (away)", fill: G.ready.fill, ink: G.ready.text } : { text: `Waiting for ${input.nameOf(seat)}`, fill: G.waiting.fill, ink: G.waiting.text });
    else if (player.ready) tags.push({ text: "✓ Ready", fill: G.ready.fill, ink: G.ready.text });
    const ty = y + G.y;
    let right = x + w - D.padX;
    for (let i = tags.length - 1; i >= 0; i--) right -= this.pill(layer, right, ty, tags[i].text, tags[i].fill, tags[i].ink) + G.gap;
    const tagsLeft = tags.length > 0 ? right + G.gap : x + w - D.padX;

    // The seat's wizard (head and hat, in its seat colour) and the name, which opens the seat's deck.
    const N = D.name;
    wizardPortrait(s, layer, lookOf(view.seatOrder, seat), x + D.padX + D.portrait.dx, y + N.y);
    const nx = x + D.padX + N.dx;
    const name = ctx.label(layer, nx, y + N.y, ctx.nameOf(seat, true, 10), N.size, N.colour, 0, true);
    fitText(name, Math.max(40, Math.min(N.maxW, tagsLeft - 10 - nx)));
    const nw = Math.min(name.width, tagsLeft - 10 - nx) + 8;
    const zone = s.add.zone(nx + nw / 2 - 4, y + N.y, nw, N.size + 10).setInteractive({ useHandCursor: true });
    zone.on("pointerdown", () => ctx.openDeck(seat));
    layer.add(zone);

    // Deck and discard counts, which open the deck and discard views (they brighten under the pointer),
    // and charms (with their hovers) at the right.
    const C = D.counts;
    const cy = y + C.y;
    if (!framed) {
      // The seat in front has its piles in the bottom strip instead.
      const dl = ctx.label(layer, x + D.padX, cy, "deck ", C.size, C.colour, 0, false);
      const dn = ctx.label(layer, dl.x + dl.width, cy, String(player.deck.length), C.size, C.colour, 0, false);
      const dc = ctx.label(layer, dn.x + dn.width, cy, ` · discard ${player.discard.length}`, C.size, C.colour, 0, false);
      const countsW = dc.x + dc.width - dl.x;
      const counts = s.add.zone(dl.x + countsW / 2, cy, countsW + 8, C.size + 12).setInteractive({ useHandCursor: true });
      const tint = (colour: string) => [dl, dn, dc].forEach((t) => t.setColor(colour));
      counts.on("pointerover", () => tint(C.hoverColour));
      counts.on("pointerout", () => tint(C.colour));
      counts.on("pointerdown", () => ctx.openDeck(seat));
      layer.add(counts);
      // Draws fly in from the deck count.
      ctx.deckSpot(layer, seat, dl.x, cy, dn);
    }
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

    // The placements for the round: a pip for each, filled as the seat places (take-backs empty one).
    const P = D.pips;
    const used = view.board.nodes.filter((n) => n.owner === seat).length;
    const pg = ctx.gfx(layer);
    for (let i = 0; i < player.placements; i++) {
      const px = x + D.padX + P.r + i * (2 * P.r + P.gap);
      const py = y + P.y;
      if (i < used) {
        pg.fillStyle(colour, 1);
        pg.fillCircle(px, py, P.r);
      } else {
        pg.lineStyle(2, colour, P.emptyAlpha + 0.4);
        pg.strokeCircle(px, py, P.r - 1);
      }
    }
    ctx.label(layer, x + D.padX + player.placements * (2 * P.r + P.gap) + 4, y + P.y, `${used} of ${player.placements} placed`, P.label, P.labelColour, 0, false);

    const Hd = D.hand;
    const top = y + Hd.top;
    const availH = h - Hd.top - Hd.bottom;
    const availW = w - 2 * D.padX;
    if (framed) {
      ctx.label(layer, x + w / 2, top + availH / 2, D.you.text, D.you.size, D.you.colour, 0.5, false);
      return;
    }

    // The hand as small dominoes in the same straight row as the hand in front: no overlap, shrunk to fit
    // (then wrapped into two rows) in the tab.
    const n = player.hand.length;
    const sizes = player.hand.map((id) => dominoPixelSize("large", view.dominoes.find((q) => q.id === id)!.kind));
    const spots = rowSlots(sizes, { x: x + D.padX, y: top, w: availW, h: availH }, Hd);
    const slots = ctx.slots(seat);
    const small: SmallDomino[] = [];
    this.small.set(seat, small);
    player.hand.forEach((id, i) => {
      const { x: px, y: py, k } = spots[i];
      // The drawing is centred on the widest cell with its socket at the left edge: shift it so the outline is centred on (px, py).
      const cx = px + ((DOMINO_W - sizes[i].w) / 2) * k;
      const c = ctx.domino(layer, id, k, "normal", cx, py, undefined, { zone: "hand", seat, index: i }, seat, false);
      if (!c.input) c.setInteractive();
      c.on("pointerover", () => this.showZoom(view, id, seat, px, y + h));
      c.on("pointerout", () => this.hideZoom());
      c.on("destroy", () => this.hideZoom());
      slots[i] = { c, pos: { x: cx, y: py, k } };
      small.push({ id, x: px, y: py, w: sizes[i].w * k, h: sizes[i].h * k, c });
    });
    if (n === 0) ctx.label(layer, x + w / 2, top + availH / 2, "No dominoes", D.you.size, D.you.colour, 0.5, false);
  }

  // The follow-up highlight (#295): per seat, the hand dominoes (by id) that could be placed after the hovered
  // play get a ring, the rest fade. null clears it. A seat missing from the map is all dim.
  setFollowUp(lit: Record<string, string[]> | null): void {
    if (this.rings?.active) this.rings.clear();
    else if (lit && this.layer?.active) this.rings = this.ctx.gfx(this.layer);
    for (const [seat, list] of this.small) {
      const ids = lit ? new Set(lit[seat] ?? []) : null;
      for (const d of list) {
        if (!d.c.active) continue;
        d.c.setAlpha(!ids || ids.has(d.id) ? 1 : combatLayoutData.followUp.dimAlpha);
        if (ids?.has(d.id) && this.rings?.active) followUpRing(this.rings, d.x, d.y, d.w, d.h, combatLayoutData.followUp.tabWidth);
      }
    }
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
}
