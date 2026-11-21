import Phaser from "phaser";
import type { BattleView } from "../engine/view";
import { combatLayoutData, hexColour } from "./presentation";
import type { CombatCtx, Layer } from "./combatCtx";
import { drawPanel } from "./turnRail";

// The rest of the combat screen's furniture (#228): the dimmed background with its vignette (L4),
// the utilities cluster top right (L6), the party bar (L2) and the actions bottom right (L7).
// Layout only; every position, size and colour is in data/presentation.json (combatLayout).

const D = combatLayoutData;
const GREEN = 0x3fae5a;
const VIGNETTE = "combat-vignette";

// A dark overlay over the table image, then a radial vignette: clear in the middle, darker at the
// edges, so the middle of the table is the brightest. The vignette is a small canvas stretched over the screen.
export function drawBackdrop(scene: Phaser.Scene): void {
  const B = D.background;
  scene.add.rectangle(960, 540, 1920, 1080, hexColour(B.dim.colour), B.dim.alpha);
  if (!scene.textures.exists(VIGNETTE)) {
    const w = 480;
    const h = 270;
    const tex = scene.textures.createCanvas(VIGNETTE, w, h);
    if (tex) {
      const c = tex.context;
      const V = B.vignette;
      const r = V.radius * Math.hypot(w, h);
      const grad = c.createRadialGradient(V.cx * w, V.cy * h, 0, V.cx * w, V.cy * h, r);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(V.clearUntil, "rgba(0,0,0,0)");
      grad.addColorStop(1, `rgba(0,0,0,${V.edgeAlpha})`);
      c.fillStyle = grad;
      c.fillRect(0, 0, w, h);
      tex.refresh();
    }
  }
  if (scene.textures.exists(VIGNETTE)) scene.add.image(960, 540, VIGNETTE).setDisplaySize(1920, 1080);
}

// "Round N" in a small pill with the playback speed button and the menu button (those two draw
// themselves; this is their backing and the round).
export function drawUtilities(ctx: CombatCtx, layer: Layer, round: number): void {
  const P = D.utilities.pill;
  drawPanel(ctx.gfx(layer), P.x, P.y, P.w, P.h, P.r);
  const R = D.utilities.round;
  ctx.label(layer, R.x, R.y, `Round ${round}`, R.size, R.colour, 0, true);
}

// The party's health and block above your hand, facing the enemy's bar. The set-off preview's ghost
// and numbers sit on it (setOffPreview.spots).
export function drawPartyBar(ctx: CombatCtx, layer: Layer, view: BattleView): void {
  const P = D.party;
  const p = view.party;
  const L = P.label;
  ctx.label(layer, L.right, L.y, "PARTY", L.size, L.colour, 1, true).setLetterSpacing(L.spacing);
  ctx.bar(layer, "party", P.bar.x, P.bar.y, P.bar.w, P.bar.h, p.health, p.maxHealth, GREEN, P.bar.fontSize);
  ctx.shield(layer, "party", P.shield.x, P.shield.y, P.shield.s, p.block);
}

export interface ActionState {
  mine: boolean; // it is your turn and you may act
  canSetOff: boolean;
  text: string; // the line over the buttons ("Your turn", or whose turn it is)
  onPass: () => void;
  onSetOff: () => void;
}

// "Your turn" over a big Set off with a smaller Pass above it. When it is not your turn, only the
// line saying whose turn it is stays and the buttons go.
export function drawActions(ctx: CombatCtx, layer: Layer, a: ActionState): void {
  const A = D.actions;
  ctx.label(layer, A.turn.x, A.turn.y, a.text, A.turn.size, a.mine ? A.turn.colour : A.turn.otherColour, 0.5, true);
  if (!a.mine) return;
  const s = ctx.scene;
  const g = ctx.gfx(layer);
  const P = A.pass;
  g.fillStyle(hexColour(P.fill), 1);
  g.fillRoundedRect(P.x, P.y, P.w, P.h, P.h / 2);
  g.lineStyle(2, hexColour(P.stroke), P.strokeAlpha);
  g.strokeRoundedRect(P.x, P.y, P.w, P.h, P.h / 2);
  ctx.label(layer, P.x + P.w / 2, P.y + P.h / 2, "Pass", P.size, P.colour, 0.5, true);
  const pz = s.add.zone(P.x + P.w / 2, P.y + P.h / 2, P.w, P.h).setInteractive({ useHandCursor: true });
  pz.on("pointerdown", a.onPass);
  layer.add(pz);

  const S = A.setOff;
  g.fillStyle(hexColour(a.canSetOff ? S.fill : S.offFill), a.canSetOff ? 1 : 0.7);
  g.fillRoundedRect(S.x, S.y, S.w, S.h, S.h / 2);
  if (a.canSetOff) {
    g.lineStyle(S.strokeWidth, hexColour(S.stroke), 1);
    g.strokeRoundedRect(S.x, S.y, S.w, S.h, S.h / 2);
  }
  ctx.label(layer, S.x + S.w / 2, S.y + S.h / 2, "Set off", S.size, a.canSetOff ? S.colour : S.offColour, 0.5, true);
  if (a.canSetOff) {
    const sz = s.add.zone(S.x + S.w / 2, S.y + S.h / 2, S.w, S.h).setInteractive({ useHandCursor: true });
    sz.on("pointerdown", a.onSetOff);
    layer.add(sz);
  }
}
