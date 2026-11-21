import Phaser from "phaser";
import type { SetOffPreview } from "../engine/battle";
import type { BattleView } from "../engine/view";
import { combatLayoutData, hexColour } from "./presentation";
import { enemies } from "./devBattle";
import type { ColumnLayout } from "./columnLayout";

// The "If it fires now" tally in the left column (#231): a damage tile and a block tile, and a line
// under them saying what that does to the enemy and the party. Every number is from the engine's
// previewSetOff, the same call that puts the ghosts on the health bars, so they always agree. It is
// drawn into the set-off preview's layer, so it updates live with hover and drag. Layout only.

const D = combatLayoutData.tally;
const FONT = "Arial, Helvetica, sans-serif";

type Pulse = (o: Phaser.GameObjects.Graphics, low: number, high: number, ms: number) => void;

// `p` null (a step is playing, or the battle is over) shows the tiles empty.
export function drawTally(scene: Phaser.Scene, into: Phaser.GameObjects.Container, view: BattleView, p: SetOffPreview | null, col: ColumnLayout, pulse: Pulse): void {
  const text = (x: number, y: number, str: string, size: number, colour: string, originX = 0.5, spacing = 0): Phaser.GameObjects.Text => {
    const t = scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color: colour, fontStyle: "bold" }).setOrigin(originX, 0.5);
    if (spacing) t.setLetterSpacing(spacing);
    into.add(t);
    return t;
  };
  const L = D.label;
  text(col.x, col.tally.y + L.h / 2, L.text, L.size, L.colour, 0, L.spacing);

  const live = !!p && p.canSetOff;
  const T = D.tile;
  const w = (col.w - T.gap) / 2;
  const top = col.tally.y + L.h;
  const lethal = live && p.lethal;
  const g = scene.add.graphics();
  into.add(g);

  const tile = (i: number, style: { fill: string; edge: string }, value: string, label: string, sub?: string): void => {
    const x = col.x + i * (w + T.gap);
    // A raised tile: a darker edge showing under the bottom.
    g.fillStyle(hexColour(style.edge), 1);
    g.fillRoundedRect(x, top, w, T.h, T.r);
    g.fillStyle(hexColour(style.fill), 1);
    g.fillRoundedRect(x, top, w, T.h - T.edge, T.r);
    const n = text(x + w / 2, top + T.numberY, value, T.numberSize, T.numberColour);
    if (n.width > w - 2 * T.numberPad) n.setFontSize(Math.floor((T.numberSize * (w - 2 * T.numberPad)) / n.width));
    text(x + w / 2, top + T.labelY, label, T.labelSize, T.labelColour, 0.5, T.labelSpacing);
    if (sub) text(x + w / 2, top + T.subY, sub, T.subSize, T.labelColour);
  };
  // The damage is what the caps would deal, with the block it wears down on top; the enemy's real
  // health change is in the line below.
  const dmg = live ? String(p.damage + p.enemyBlockUsed) : D.tile.dash;
  const blocked = live && p.enemyBlockUsed > 0 ? `${p.enemyBlockUsed} ${D.damage.sub}` : undefined;
  tile(0, D.damage, dmg, lethal ? D.lethal.label : D.damage.label, blocked);
  tile(1, D.block, live ? String(p.partyBlockGain) : D.tile.dash, D.block.label);
  if (lethal) {
    const K = D.lethal;
    const glow = scene.add.graphics();
    glow.lineStyle(K.width, hexColour(K.glow), 1);
    glow.strokeRoundedRect(col.x - K.pad, top - K.pad, w + 2 * K.pad, T.h + 2 * K.pad, T.r + K.pad);
    into.add(glow);
    pulse(glow, K.alphaLow, K.alphaHigh, K.pulseMs);
  }

  // The line under the tiles.
  if (!p) return;
  const Ln = D.line;
  const y = top + T.h + Ln.gap + Ln.h / 2;
  if (!p.canSetOff) {
    text(col.x, y, Ln.noCaps, Ln.size, Ln.colour, 0);
    return;
  }
  const name = enemies.find((x) => x.id === view.enemy.id)?.name ?? view.enemy.id;
  const row = scene.add.container(col.x, y);
  into.add(row);
  let x = 0;
  const part = (str: string, colour: string): void => {
    const t = scene.add.text(x, 0, str, { fontFamily: FONT, fontSize: `${Ln.size}px`, color: colour, fontStyle: "bold" }).setOrigin(0, 0.5);
    row.add(t);
    x += t.width;
  };
  part(`${name} ${view.enemy.health} → ${p.enemyHealth} · `, Ln.colour);
  if (p.partyDamage > 0) {
    part("party takes ", Ln.colour);
    part(String(p.partyDamage), Ln.lossColour);
  } else part(Ln.safe, Ln.safeColour);
  if (x > col.w) row.setScale(col.w / x); // a long name shrinks the line rather than leave the column
}
