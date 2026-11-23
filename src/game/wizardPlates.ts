import type { BattleView } from "../engine/view";
import { BattleWizards } from "./battleWizards";
import { combatLayoutData } from "./presentation";
import { seatColour } from "./seatColours";
import { drawPips, drawPlate, drawTick } from "./kit";
import type { CombatCtx, Layer } from "./combatCtx";
import { ellipsize } from "./combatCtx";
import presentation from "../../data/presentation.json";

// The small plate under each wizard (#303): the seat's name, its placements left as kit pips and a tick
// when it is Ready. An away seat's plate is dimmed with its wizard. The plates are interface: their own
// container ("interface") that the camera leaves still. Layout only; every number is in
// data/presentation.json (combatLayout.plates).

const D = combatLayoutData.plates;
const U = presentation.kit.unit;
const PIP = presentation.kit.pips;
const TICK_W = presentation.kit.tick.rows[0].length;

export function drawWizardPlates(ctx: CombatCtx, layer: Layer, view: BattleView, nameOf: (seat: string) => string): void {
  const root = ctx.scene.add.container(0, 0).setName("interface");
  layer.add(root);
  view.seatOrder.forEach((seat, i) => {
    const player = view.players.find((p) => p.id === seat);
    if (!player) return;
    const feet = BattleWizards.spot(view.seatOrder.length, i);
    const box = ctx.scene.add.container(0, 0);
    root.add(box);
    if (ctx.isAway(seat)) box.setAlpha(D.awayAlpha);
    const g = ctx.gfx(box); // under the texts, drawn once the plate's size is known
    const name = ctx.label(box, 0, 0, "", D.size, D.colour, 0.5, true);
    ellipsize(name, nameOf(seat), D.maxNameW);
    const used = view.board.nodes.filter((n) => n.owner === seat).length;
    const total = player.placements;
    const pipsW = total > 0 ? total * (PIP.size + PIP.gap) - PIP.gap : 0; // grid pixels
    const gap = Math.ceil(D.tickGap / U);
    const rowW = pipsW + (pipsW > 0 && player.ready ? gap : 0) + (player.ready ? TICK_W : 0);
    const w = Math.max(D.minW, Math.ceil(name.width / U), rowW) + 2 * D.padX;
    const x = Math.round((feet.x - (w * U) / 2) / U) * U;
    const y = feet.y + D.dy;
    drawPlate(g, x, y, w, D.h, "#" + seatColour(view.seatOrder, seat).toString(16).padStart(6, "0"));
    name.setPosition(Math.round(x + (w * U) / 2), Math.round(y + D.nameY));
    // The pips and the tick in one row, centred.
    let rx = x + Math.round(((w - rowW) * U) / 2);
    if (total > 0) {
      drawPips(g, rx, y + D.pipsY, Math.max(0, total - used), Math.min(used, total));
      rx += (pipsW + gap) * U;
    }
    if (player.ready) drawTick(g, rx, y + D.pipsY + U);
    box.bringToTop(name);
  });
}
