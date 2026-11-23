import Phaser from "phaser";
import type { BattleView } from "../engine/view";
import { combatLayoutData } from "./presentation";
import type { CombatCtx, Layer } from "./combatCtx";
import { drawPips, drawPlate, drawTick, kitButton } from "./kit";
import { handArea } from "./handRow";
import { roleStyle, snap, tabularDigits } from "./fonts";
import presentation from "../../data/presentation.json";

// The rest of the combat screen's furniture (#302): the table picture with its soft dark edge, and the
// bottom strip, one kit plate across the screen: the party's health and block with the round, your
// placements left and your deck and used piles, and Ready (Fire in single player). The hand sits in the
// strip's middle (handRow.ts) and the playback speed and menu buttons on its left (speedControl.ts,
// GameMenuScene.ts). Layout only; every position, size and colour is in data/presentation.json (combatLayout).

const D = combatLayoutData;
const S = D.strip;
const U = presentation.kit.unit;
const VIGNETTE = "combat-vignette";

// The strip's top edge: where the table ends.
export const stripTop = S.y;

// The strip's layout data and its plate, shared with the map screen's strip (#307).
export const stripLayout = S;
export function drawStripPlate(g: Phaser.GameObjects.Graphics, edge?: string): void {
  drawPlate(g, S.plate.x, S.y, S.plate.w, S.plate.h, edge);
}

// The table picture, sharp (it is drawn at x3 with nearest-neighbour filtering), then a soft dark edge over it.
// With no picture, a code-drawn table.
export function drawBackdrop(scene: Phaser.Scene): void {
  const key = `art/${D.background.art}`;
  if (scene.textures.exists(key)) {
    scene.add.image(960, 540, key).setDisplaySize(1920, 1080);
  } else {
    const g = scene.add.graphics();
    g.fillStyle(0x2e2016, 1);
    g.fillRect(0, 0, 1920, 1080);
    g.fillStyle(0x1e5a42, 1);
    g.fillRoundedRect(28, 28, 1864, 1024, 130);
  }
  const V = D.background.vignette;
  if (!scene.textures.exists(VIGNETTE)) {
    const tex = scene.textures.createCanvas(VIGNETTE, 480, 270);
    if (tex) {
      const c = tex.context;
      const r = V.radius * Math.hypot(480, 270);
      const grad = c.createRadialGradient(V.cx * 480, V.cy * 270, 0, V.cx * 480, V.cy * 270, r);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(V.clearUntil, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0," + V.edgeAlpha + ")");
      c.fillStyle = grad;
      c.fillRect(0, 0, 480, 270);
      tex.refresh();
    }
  }
  if (scene.textures.exists(VIGNETTE)) scene.add.image(960, 540, VIGNETTE).setDisplaySize(1920, 1080);
}

export interface StripState {
  seat: string; // the seat whose hand is in front
  edge: string | null; // a hand that is not your own seat's: the strip's edge takes its seat colour
  placements: { left: number; spent: number };
  fire: boolean; // single player: the button reads Fire and sets every seat Ready at once
  ready: boolean; // you are Ready: the button reads "Not ready" and undoes it
  enabled: boolean; // false while a domino is dragged, a step plays back or the host has not answered
  count: { ready: number; total: number } | null; // online: "2 of 4 ready"
  onPress: () => void;
  openDeck: () => void; // the deck and used piles open this seat's deck in the deck viewer
}

// The strip. `view.players` has the front seat's deck and used piles; clicking them opens that seat's deck.
export function drawStrip(ctx: CombatCtx, layer: Layer, view: BattleView, s: StripState): void {
  const scene = ctx.scene;
  const g = ctx.gfx(layer);
  drawStripPlate(g, s.edge ?? undefined);

  // The party: label, health bar, block, and the round under them.
  const P = S.party;
  ctx.label(layer, P.x, P.labelY, P.label, P.labelSize, P.labelColour, 0);
  ctx.bar(layer, "party", P.x, P.barY, P.barW, "health", view.party.health, view.party.maxHealth);
  const barH = presentation.kit.bar.height * U;
  ctx.shield(layer, "party", P.x + P.barW * U + P.shield.dx, P.barY + barH / 2, P.shield.s, view.party.block);
  const R = S.round;
  const word = ctx.label(layer, R.x, R.y, "Round ", R.size, R.colour, 0);
  ctx.label(layer, word.x + word.width, R.y, String(view.round), R.size, R.numberColour, 0);

  // Your placements left, then the deck and used piles.
  const L = S.pile;
  const pg = ctx.gfx(layer);
  drawPips(pg, L.x, L.pips.y, s.placements.left, s.placements.spent);
  const pipsW = (s.placements.left + s.placements.spent) * (presentation.kit.pips.size + presentation.kit.pips.gap) * U;
  ctx.label(layer, L.x + pipsW + L.pips.labelGap, L.pips.y + L.pips.labelDy, `${s.placements.left} ${L.pips.left}`, L.pips.size, L.pips.colour, 0);
  const player = view.players.find((p) => p.id === s.seat);
  const deck = pile(ctx, layer, L.deck.y, L.deck.label, player?.deck.length ?? 0, s.openDeck);
  pile(ctx, layer, L.used.y, L.used.label, player?.discard.length ?? 0, s.openDeck);
  ctx.deckSpot(layer, s.seat, deck.x, deck.y, deck.text); // new draws fly in from the deck pile

  // Ready (Fire in single player), and how many are Ready online. Your own Ready shows as a tick.
  const Rd = S.ready;
  const label = s.fire ? Rd.fireText : s.ready ? Rd.undoText : Rd.text;
  const btn = kitButton(scene, Rd.x, Rd.y, label, s.onPress, { disabled: !s.enabled, width: Rd.w });
  layer.add(btn);
  if (s.count) {
    const text = `${s.count.ready} ${Rd.of} ${s.count.total} ${Rd.tail}`;
    const t = ctx.label(layer, Rd.x, Rd.countY, text, Rd.countSize, Rd.countColour, 0.5);
    if (s.ready) drawTick(ctx.gfx(layer), t.x + t.width + Rd.tick.dx, Rd.countY + Rd.tick.dy);
  }
}

// A small pile count: a kit plate with a label and the number, which opens the deck viewer. Returns where
// its number is (the draw animation's start for the deck).
function pile(ctx: CombatCtx, layer: Layer, y: number, label: string, count: number, open: () => void): { x: number; y: number; text: Phaser.GameObjects.Text } {
  const L = S.pile;
  const K = L.plate;
  const w = L.w * U;
  const h = K.h * U;
  const g = ctx.gfx(layer);
  drawPlate(g, L.x, y, L.w, K.h);
  const name = ctx.label(layer, L.x + K.labelX, y + h / 2, label, K.labelSize, K.labelColour, 0);
  const text = tabularDigits(ctx.scene.add.text(L.x + w - K.labelX, y + h / 2, String(count), { ...roleStyle("text"), color: K.numberColour }).setOrigin(1, 0.5));
  snap(text);
  layer.add(text);
  const zone = ctx.scene.add.zone(L.x + w / 2, y + h / 2, w, h).setInteractive({ useHandCursor: true });
  zone.on("pointerover", () => [name, text].forEach((t) => t.setColor(K.hover)));
  zone.on("pointerout", () => {
    name.setColor(K.labelColour);
    text.setColor(K.numberColour);
  });
  zone.on("pointerdown", open);
  layer.add(zone);
  return { x: L.x + w / 2, y: y + h / 2, text };
}

// A small kit plate on the strip's top edge, over the hand: whose hand it is, in that seat's colour.
export function drawHandTab(ctx: CombatCtx, layer: Layer, text: string, colour: number): void {
  const F = D.handFrame;
  const hex = "#" + colour.toString(16).padStart(6, "0");
  const g = ctx.gfx(layer);
  const t = ctx.label(layer, 0, 0, text, F.size, F.colour, 0);
  const w = Math.ceil(t.width / U) + 2 * F.padX;
  const a = handArea();
  const x = a.x;
  const y = S.y + F.dy;
  drawPlate(g, x, y, w, F.h, hex);
  t.setPosition(Math.round(x + (w * U - t.width) / 2), Math.round(y + (F.h * U) / 2) + F.textDy);
  t.setOrigin(0, 0.5);
}
