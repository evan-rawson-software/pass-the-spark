import type { BattleView } from "../engine/view";
import { combatData, combatLayoutData } from "./presentation";

// Where each part of the left column goes (#231, Spotlight). The column is stacked top to bottom from
// what it holds this round: the passive chips, the round chips and the "later" row come and go. The
// portrait card takes whatever height is left, between its minimum and maximum, so it shrinks first
// when a boss with two passives, a round chip and a combined intent need the room; then the gaps shrink.
// The footer sits at the bottom. Sizes are in data/presentation.json (combatLayout); no rules here.

const C = combatLayoutData.column;
const E = combatLayoutData.enemy;
const T = combatLayoutData.tally;
const P = combatLayoutData.party;
const F = combatLayoutData.footer;

export interface ColumnLayout {
  x: number; // the inner edge: everything in the column is x .. x + w
  w: number;
  card: { y: number; h: number };
  name: { y: number };
  chipsY: number; // the first passive chip
  bar: { y: number };
  intent: { y: number; h: number };
  roundY: number; // the first round chip
  laterY: number;
  tally: { y: number };
  party: { y: number };
}

// The footer is fixed to the bottom of the column: round, playback speed and menu.
export function footerBox(): { x: number; y: number; w: number; h: number } {
  return { x: C.x + C.padX, y: C.y + C.h - C.padBottom - F.h, w: C.w - 2 * C.padX, h: F.h };
}

// Where the playback speed button (its right edge) and the menu button (its centre) sit in the footer.
export function footerSpots(): { speed: { right: number; y: number }; menu: { x: number; y: number } } {
  const b = footerBox();
  return { speed: { right: b.x + b.w + F.speed.rightDx, y: b.y + b.h / 2 }, menu: { x: b.x + b.w + F.menu.dx, y: b.y + b.h / 2 } };
}

const stack = (n: number, h: number, gap: number): number => (n === 0 ? 0 : n * h + (n - 1) * gap);

export function columnLayout(view: BattleView): ColumnLayout {
  const x = C.x + C.padX;
  const w = C.w - 2 * C.padX;
  const top = C.y + C.padTop;
  const bottom = C.y + C.h - C.padBottom;
  const nChips = view.enemy.passives.length;
  const nRound = (view.locked ? 1 : 0) + (view.blessing ? 1 : 0);
  const later = view.upcomingIntents.length > 0;
  const chipsH = stack(nChips, E.chip.h, E.chip.gap);
  const roundH = stack(nRound, E.chip.h, E.chip.gap);

  const head = E.name.h + (nChips > 0 ? E.innerGap + chipsH : 0) + E.innerGap + E.bar.h;
  const intentBlock = E.intent.h + (nRound > 0 ? E.innerGap + roundH : 0) + (later ? E.innerGap + E.later.h : 0);
  // The block tile alone (the damage total is hidden), or the old tally: two tiles and a line.
  const tallyH = combatData.showDamageTotal ? T.label.h + T.tile.h + T.line.gap + T.line.h : T.label.h + T.blockTile.h;
  const partyH = P.label.h + P.bar.h;
  const fixed = head + intentBlock + tallyH + partyH + F.h;
  const gaps = 5; // card | head | intent | tally | party | footer
  const spare = bottom - top - fixed;
  const cardH = Math.max(E.card.minH, Math.min(E.card.maxH, spare - gaps * C.minGap));
  const gap = Math.max(C.minGap, Math.min(C.maxGap, (spare - cardH) / gaps));

  let y = top;
  const card = { y, h: cardH };
  y += cardH + gap;
  const nameY = y;
  y += E.name.h;
  const chipsY = y + E.innerGap;
  if (nChips > 0) y += E.innerGap + chipsH;
  y += E.innerGap;
  const bar = { y };
  y += E.bar.h + gap;
  const intent = { y, h: E.intent.h };
  y += E.intent.h;
  const roundY = y + E.innerGap;
  if (nRound > 0) y += E.innerGap + roundH;
  const laterY = y + E.innerGap;
  if (later) y += E.innerGap + E.later.h;
  y += gap;
  const tally = { y };
  y += tallyH + gap;
  const party = { y };
  return { x, w, card, name: { y: nameY }, chipsY, bar, intent, roundY, laterY, tally, party };
}
