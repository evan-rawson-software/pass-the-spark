import Phaser from "phaser";
import type { BattleView } from "../engine/view";
import { combatLayoutData, hexColour } from "./presentation";
import type { CombatCtx, Layer } from "./combatCtx";
import type { ColumnLayout } from "./columnLayout";
import { footerBox } from "./columnLayout";

// The rest of the combat screen's furniture (#228, #231): the dimmed, lit background (L4), the left
// column's panel, party and footer, and the actions bottom right (L7). Layout only; every position,
// size and colour is in data/presentation.json (combatLayout).

const D = combatLayoutData;
const GREEN = 0x3fae5a;
const VIGNETTE = "combat-vignette";
const LIGHT = "combat-light";

// A small canvas texture, painted once.
function canvasTexture(scene: Phaser.Scene, key: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void): boolean {
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, w, h);
    if (tex) {
      paint(tex.context);
      tex.refresh();
    }
  }
  return scene.textures.exists(key);
}

// A dark overlay over the table image, a warm soft light over the board's area, then a radial
// vignette: clear in the middle, darker at the edges.
export function drawBackdrop(scene: Phaser.Scene): void {
  const B = D.background;
  scene.add.rectangle(960, 540, 1920, 1080, hexColour(B.dim.colour), B.dim.alpha);
  const L = B.light;
  const rgb = hexColour(L.colour);
  const colour = (a: number): string => "rgba(" + (rgb >> 16) + "," + ((rgb >> 8) & 255) + "," + (rgb & 255) + "," + a + ")";
  const lit = canvasTexture(scene, LIGHT, 256, 128, (c) => {
    const grad = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, colour(1));
    grad.addColorStop(1, colour(0));
    c.scale(2, 1); // a round gradient stretched into an ellipse
    c.fillStyle = grad;
    c.fillRect(0, 0, 128, 128);
  });
  if (lit && L.alpha > 0) scene.add.image(L.x, L.y, LIGHT).setDisplaySize(L.w, L.h).setAlpha(L.alpha).setBlendMode(Phaser.BlendModes.ADD);
  const V = B.vignette;
  const dark = canvasTexture(scene, VIGNETTE, 480, 270, (c) => {
    const r = V.radius * Math.hypot(480, 270);
    const grad = c.createRadialGradient(V.cx * 480, V.cy * 270, 0, V.cx * 480, V.cy * 270, r);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(V.clearUntil, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0," + V.edgeAlpha + ")");
    c.fillStyle = grad;
    c.fillRect(0, 0, 480, 270);
  });
  if (dark) scene.add.image(960, 540, VIGNETTE).setDisplaySize(1920, 1080);
}

// The dark panel down the left edge that the column sits on.
export function drawColumnPanel(ctx: CombatCtx, layer: Layer): void {
  const C = D.column;
  const g = ctx.gfx(layer);
  g.fillStyle(hexColour(C.fill), C.fillAlpha);
  g.fillRoundedRect(C.x, C.y, C.w, C.h, C.r);
  g.lineStyle(C.strokeWidth, hexColour(C.stroke), 1);
  g.strokeRoundedRect(C.x, C.y, C.w, C.h, C.r);
}

// The party's health and block, in the column. The set-off preview's ghost and numbers sit on it.
export function drawPartyBar(ctx: CombatCtx, layer: Layer, view: BattleView, col: ColumnLayout): void {
  const P = D.party;
  const p = view.party;
  const L = P.label;
  ctx.label(layer, col.x, col.party.y + L.h / 2, L.text, L.size, L.colour, 0, true).setLetterSpacing(L.spacing);
  const by = col.party.y + L.h;
  ctx.bar(layer, "party", col.x, by, P.bar.w, P.bar.h, p.health, p.maxHealth, GREEN, P.bar.fontSize);
  ctx.shield(layer, "party", col.x + P.bar.w + P.shield.dx, by + P.bar.h / 2, P.shield.s, p.block);
}

// "Round N" at the bottom of the column. The playback speed button and the menu button draw
// themselves on top of the footer (speedControl.ts, GameMenuScene.ts), at footerSpots().
export function drawFooter(ctx: CombatCtx, layer: Layer, round: number): void {
  const F = D.footer;
  const b = footerBox();
  const g = ctx.gfx(layer);
  g.fillStyle(hexColour(F.fill), 1);
  g.fillRoundedRect(b.x, b.y, b.w, b.h, F.r);
  g.lineStyle(F.strokeWidth, hexColour(F.stroke), 1);
  g.strokeRoundedRect(b.x, b.y, b.w, b.h, F.r);
  const R = F.round;
  const word = ctx.label(layer, b.x + R.dx, b.y + b.h / 2, "Round ", R.size, R.colour, 0, true);
  ctx.label(layer, word.x + word.width, b.y + b.h / 2, String(round), R.size, R.numberColour, 0, true);
}

export interface ActionState {
  mine: boolean; // it is your turn and you may act
  passFires: boolean; // the engine's view.passFires: this pass completes the round and fires the cascade
  onPass: () => void;
}

// The big Pass button (the seat tabs say whose turn it is); it reads "Pass and fire" when the pass fires
// the cascade. When it is not your turn, the button goes.
export function drawActions(ctx: CombatCtx, layer: Layer, a: ActionState): void {
  const A = D.actions;
  if (!a.mine) return;
  const s = ctx.scene;
  const g = ctx.gfx(layer);
  const P = A.pass;
  g.fillStyle(hexColour(P.fill), 1);
  g.fillRoundedRect(P.x, P.y, P.w, P.h, P.h / 2);
  g.lineStyle(P.strokeWidth, hexColour(P.stroke), 1);
  g.strokeRoundedRect(P.x, P.y, P.w, P.h, P.h / 2);
  ctx.label(layer, P.x + P.w / 2, P.y + P.h / 2, a.passFires ? P.fireText : P.text, a.passFires ? P.fireSize : P.size, P.colour, 0.5, true);
  const pz = s.add.zone(P.x + P.w / 2, P.y + P.h / 2, P.w, P.h).setInteractive({ useHandCursor: true });
  pz.on("pointerdown", a.onPass);
  layer.add(pz);
}
