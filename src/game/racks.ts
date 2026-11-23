import Phaser from "phaser";
import type { BattleView } from "../engine/view";
import { dominoPixelSize } from "./dominoDrawing";
import { followUpRing, rowSlots } from "./handRow";
import type { RowParams } from "./handRow";
import { charmWithTip, charmsByIds } from "./charmUi";
import { seatColour } from "./seatColours";
import { lookOf, wizardPortrait } from "./battleWizards";
import { combatLayoutData, hexColour } from "./presentation";
import { drawPips, drawPlate, drawTick } from "./kit";
import type { CombatCtx, Layer } from "./combatCtx";
import { ellipsize } from "./combatCtx";
import presentation from "../../data/presentation.json";

// The teammates' racks along the top of the combat screen (#303, S9): one slim rack for every seat but the
// one whose hand is in front, in seat order. A rack shows the seat's head, name and colour edge, its
// placements left as pips, a Ready tag (an away seat says "Waiting for [name]", then "Ready (away)"), its
// charms and its hand as small dominoes in the hand row's rule (see rowSlots). Pointing at a rack hangs a
// bigger copy of its hand under it, whose dominoes have tooltips. A click on a rack you may play from (single player: any
// seat; online: an away seat the host has taken over) brings its hand to the front. The racks are
// interface: their own container ("interface") that the camera leaves still. Layout only; every number is in
// data/presentation.json (combatLayout.racks).

const D = combatLayoutData.racks;
const U = presentation.kit.unit;
const DOMINO_W = 240; // a domino's cell at scale 1 (the drawing is centred on it, its socket at the left edge)
const ZOOM_DEPTH = 960;

export interface RacksInput {
  front: string; // the seat whose hand is in front: it has no rack
  pickable(seat: string): boolean; // a click on its rack brings this seat's hand to the front
  onPick(seat: string): void;
  isAway(seat: string): boolean;
  nameOf(seat: string): string; // the seat's full name
}

interface SmallDomino { id: string; x: number; y: number; w: number; h: number; c: Phaser.GameObjects.Container } // x, y: the outline's centre; w, h: its size as drawn
interface Rect { seat: string; x: number; y: number; w: number; h: number }

const hex = (n: number): string => "#" + n.toString(16).padStart(6, "0");

export class Racks {
  private small = new Map<string, SmallDomino[]>(); // each rack's small hand dominoes as drawn
  private rings?: Phaser.GameObjects.Graphics;
  private root?: Layer;
  private zoom?: Layer;
  private zoomRect?: Rect;
  private rects: Rect[] = [];
  private view?: BattleView;
  private input?: RacksInput;

  constructor(private ctx: CombatCtx) {
    // The scene's input plugin drops this with the scene.
    ctx.scene.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onMove(p));
  }

  draw(layer: Layer, view: BattleView, input: RacksInput): void {
    this.hideZoom();
    this.small = new Map();
    this.rings = undefined;
    this.rects = [];
    this.view = view;
    this.input = input;
    const root = this.ctx.scene.add.container(0, 0).setName("interface");
    layer.add(root);
    this.root = root;
    const seats = view.seatOrder.filter((s) => s !== input.front && view.players.some((p) => p.id === s));
    if (seats.length === 0) return;
    const w = Math.min(D.maxW, (D.w - (seats.length - 1) * D.gap) / seats.length);
    seats.forEach((seat, i) => {
      const x = D.x + i * (w + D.gap);
      this.rects.push({ seat, x, y: D.y, w, h: D.h });
      this.rack(root, view, input, seat, x, D.y, w, D.h);
    });
  }

  // One rack into `parent`.
  private rack(parent: Layer, view: BattleView, input: RacksInput, seat: string, x: number, y: number, w: number, h: number): void {
    const ctx = this.ctx;
    const s = ctx.scene;
    const player = view.players.find((p) => p.id === seat)!;
    const colour = seatColour(view.seatOrder, seat);
    const away = input.isAway(seat);
    drawPlate(ctx.gfx(parent), x, y, Math.round(w / U), Math.round(h / U), hex(colour));
    if (input.pickable(seat)) {
      // A click anywhere on the rack (the parts drawn after this one take their own clicks first).
      const pick = s.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true });
      pick.on("pointerdown", () => input.onPick(seat));
      parent.add(pick);
    }

    // The tag at the right of the name row: Ready, or the away seat's.
    const T = D.tag;
    let tag: { text: string; kind: "ready" | "waiting" | "away"; tick: boolean } | null = null;
    if (away) tag = player.ready ? { text: "Ready (away)", kind: "away", tick: true } : { text: `Waiting for ${input.nameOf(seat)}`, kind: "waiting", tick: false };
    else if (player.ready) tag = { text: "Ready", kind: "ready", tick: true };
    let tagLeft = x + w - D.padX;
    if (tag) tagLeft -= this.tag(parent, tagLeft, y + T.y, tag.text, tag.kind, tag.tick, tagLeft - (x + D.name.dx + D.name.minW + T.gap));

    // The seat's wizard (head and hat, in its seat colour) and the name.
    wizardPortrait(s, parent, lookOf(view.seatOrder, seat), x + D.portrait.dx, y + D.portrait.y);
    const nx = x + D.name.dx;
    const name = ctx.label(parent, nx, y + D.name.y, "", D.name.size, D.name.colour, 0, true);
    ellipsize(name, input.nameOf(seat), Math.max(D.name.minW, tagLeft - T.gap - nx));

    // Placements left as pips, and the charms (with their hovers) at the right.
    const used = view.board.nodes.filter((n) => n.owner === seat).length;
    drawPips(ctx.gfx(parent), x + D.pips.dx, y + D.pips.y, Math.max(0, player.placements - used), Math.min(used, player.placements));
    const K = D.charm;
    const cy = y + K.y;
    charmsByIds(player.charms).forEach((ch, i, all) => {
      const px = x + w - D.padX - K.size / 2 - (all.length - 1 - i) * K.step;
      const back = s.add.graphics();
      back.fillStyle(hexColour(K.fill), 1);
      back.fillCircle(px, cy, K.size / 2 + 2);
      parent.add(back);
      parent.add(charmWithTip(s, ctx.tooltip, ch, K.size, px, cy));
      ctx.refs().charms.set(`${seat}:${ch.id}`, { x: px, y: cy });
    });
    // Draws fly in from, and take-backs fly to, the seat's head.
    const spot = ctx.label(parent, x + D.portrait.dx, y + D.portrait.y, "", D.name.size, D.name.colour, 0.5, false).setVisible(false);
    ctx.deckSpot(parent, seat, x + D.portrait.dx, y + D.portrait.y, spot);
    this.hand(parent, view, input, seat, { x: x + D.padX, y: y + D.hand.top, w: w - 2 * D.padX, h: h - D.hand.top - D.hand.bottom }, D.hand, false);
  }

  // A seat's hand as small dominoes in the same straight row as the hand in front: no overlap, shrunk to
  // fit (then wrapped into two rows) in `area`. The small ones (on the rack) have no tooltip and show pings;
  // the bigger ones (`big`, hanging under the rack) have tooltips and leave the pings to the small ones.
  private hand(parent: Layer, view: BattleView, input: RacksInput, seat: string, area: { x: number; y: number; w: number; h: number }, params: RowParams, big: boolean): void {
    const ctx = this.ctx;
    const player = view.players.find((p) => p.id === seat)!;
    if (player.hand.length === 0) {
      ctx.label(parent, area.x + area.w / 2, area.y + area.h / 2, D.empty.text, D.empty.size, D.empty.colour, 0.5, false);
      return;
    }
    const sizes = player.hand.map((id) => dominoPixelSize("large", view.dominoes.find((q) => q.id === id)!.kind));
    const spots = rowSlots(sizes, area, params);
    const slots = big ? [] : ctx.slots(seat);
    const small: SmallDomino[] = [];
    if (!big) this.small.set(seat, small);
    const pick = input.pickable(seat) ? () => input.onPick(seat) : undefined;
    player.hand.forEach((id, i) => {
      const { x: px, y: py, k } = spots[i];
      // The drawing is centred on the widest cell with its socket at the left edge: shift it so the outline is centred on (px, py).
      const cx = px + ((DOMINO_W - sizes[i].w) / 2) * k;
      const c = ctx.domino(parent, id, k, "normal", cx, py, pick, big ? undefined : { zone: "hand", seat, index: i }, seat, big);
      if (!c.input) c.setInteractive();
      if (!big) {
        slots[i] = { c, pos: { x: cx, y: py, k } };
        small.push({ id, x: px, y: py, w: sizes[i].w * k, h: sizes[i].h * k, c });
      }
    });
  }

  // A kit plate tag, its right edge at `right`, its middle at `cy`; returns its width plus the gap after it.
  private tag(parent: Layer, right: number, cy: number, text: string, kind: "ready" | "waiting" | "away", tick: boolean, maxW: number): number {
    const T = D.tag;
    const look = T[kind];
    const t = this.ctx.label(parent, 0, 0, "", T.size, look.colour, 0, false);
    const tickW = tick ? 6 * U + T.tickGap : 0; // the tick is 6 grid pixels wide
    ellipsize(t, text, maxW - 2 * T.padX * U - 4 * U - tickW);
    const gw = Math.ceil((t.width + tickW) / U) + 2 * T.padX + 4; // 4: the plate's two edge rows each side
    const x = right - gw * U;
    const top = cy - (T.h * U) / 2;
    const g = this.ctx.gfx(parent);
    drawPlate(g, x, top, gw, T.h, look.edge);
    parent.bringToTop(t); // the text was made first, to measure it: bring it above the plate
    let tx = x + (2 + T.padX) * U;
    if (tick) {
      drawTick(g, tx, cy - 7);
      tx += 6 * U + T.tickGap;
    }
    t.setPosition(Math.round(tx), Math.round(cy) + T.textDy).setOrigin(0, 0.5);
    return gw * U + T.gap;
  }

  // The follow-up highlight (#295): per seat, the hand dominoes (by id) that could be placed after the hovered
  // play get a ring, the rest fade. null clears it. A seat missing from the map is all dim.
  setFollowUp(lit: Record<string, string[]> | null): void {
    if (this.rings?.active) this.rings.clear();
    else if (lit && this.root?.active) this.rings = this.ctx.gfx(this.root);
    for (const [seat, list] of this.small) {
      const ids = lit ? new Set(lit[seat] ?? []) : null;
      for (const d of list) {
        if (!d.c.active) continue;
        d.c.setAlpha(!ids || ids.has(d.id) ? 1 : combatLayoutData.followUp.dimAlpha);
        if (ids?.has(d.id) && this.rings?.active) followUpRing(this.rings, d.x, d.y, d.w, d.h, combatLayoutData.followUp.rackWidth);
      }
    }
  }

  // Pointing at a rack hangs its bigger hand under it; leaving the rack and that hand closes it. Not while a
  // button is held (a drag).
  private onMove(p: Phaser.Input.Pointer): void {
    const inside = (r: Rect): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    if (this.zoomRect) {
      if (!inside(this.zoomRect) && !inside(this.rects.find((r) => r.seat === this.zoomRect!.seat)!)) this.hideZoom();
      return;
    }
    if (p.isDown) return;
    const r = this.rects.find(inside);
    if (r) this.showZoom(r);
  }

  // The bigger hand: a plate in the seat's colour just under its rack, kept inside the top strip.
  private showZoom(r: Rect): void {
    const view = this.view;
    const input = this.input;
    if (!view || !input || !this.root?.active) return;
    const Z = D.zoom;
    const w = Math.max(r.w, Math.min(Z.w, D.w));
    const h = Z.hand.h + 2 * Z.pad;
    const x = Math.max(D.x, Math.min(D.x + D.w - w, r.x));
    const y = r.y + r.h + Z.dy;
    const zoom = this.ctx.scene.add.container(0, 0).setDepth(ZOOM_DEPTH);
    this.zoom = zoom;
    this.zoomRect = { seat: r.seat, x, y, w, h };
    drawPlate(this.ctx.gfx(zoom), x, y, Math.round(w / U), Math.round(h / U), hex(seatColour(view.seatOrder, r.seat)));
    if (input.pickable(r.seat)) {
      const pick = this.ctx.scene.add.zone(x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true });
      pick.on("pointerdown", () => input.onPick(r.seat));
      zoom.add(pick);
    }
    this.hand(zoom, view, input, r.seat, { x: x + D.padX, y: y + Z.pad, w: w - 2 * D.padX, h: Z.hand.h }, Z.hand, true);
  }

  private hideZoom(): void {
    this.zoom?.destroy(true);
    this.zoom = undefined;
    this.zoomRect = undefined;
    this.ctx.tooltip?.hide();
  }
}
