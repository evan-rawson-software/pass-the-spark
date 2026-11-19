import Phaser from "phaser";
import { SKIP } from "../engine/rewards";
import type { Domino, Rarity } from "../engine/types";
import { drawDomino, dominoPixelSize } from "./dominoDrawing";
import type { DominoSize } from "./dominoDrawing";
import { drawPartyHud, drawRunHeader } from "./partyHud";
import { actingSeat, currentRun, nextPending, seatName, submitRunChoice, watchRun } from "./runSession";
import { charmWithTip, charmsByIds } from "./charmUi";
import { Tooltip } from "./tooltip";
import { artImage } from "./art";
import { button, drawBackground, label } from "./ui";

// Victory and domino choice screen (#52). Draws the run's reward state and sends picks to the
// run as "reward" choices; offers, rarities, coins and what counts as a legal pick all come
// from the engine. Single player: every seat's offer is on screen, the seat whose turn it is
// to pick is highlighted and large, and one person picks for each seat in turn. Online (#49) your
// own offer is large, teammates' are small with "picked" or "choosing", and everyone picks at once.

const RARITY_STYLE: Record<Rarity, { color: number; text: string; gems: number }> = {
  common: { color: 0xb8c4bd, text: "#d8e2dc", gems: 1 },
  uncommon: { color: 0x4fa3e8, text: "#8ccaff", gems: 2 },
  rare: { color: 0xffc83d, text: "#ffd86b", gems: 3 },
};

// Rarity marker drawn by code: one, two or three diamonds in the rarity's colour, plus its name.
function drawRarity(scene: Phaser.Scene, x: number, y: number, rarity: Rarity | undefined, size: DominoSize): void {
  if (!rarity) return;
  const style = RARITY_STYLE[rarity];
  const r = size === "large" ? 11 : 7;
  const g = scene.add.graphics();
  g.fillStyle(style.color, 1);
  g.lineStyle(2, 0x2a2a2a, 1);
  const gap = r * 2.4;
  const left = x - ((style.gems - 1) * gap) / 2 - (size === "large" ? 44 : 0);
  for (let i = 0; i < style.gems; i++) {
    const cx = left + i * gap;
    g.beginPath();
    g.moveTo(cx, y - r);
    g.lineTo(cx + r, y);
    g.lineTo(cx, y + r);
    g.lineTo(cx - r, y);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }
  if (size === "large") label(scene, x + 10, y, rarity, 24, { bold: true, color: style.text });
}

export class RewardScene extends Phaser.Scene {
  constructor() {
    super("reward");
  }

  // data.localSeat: the seat this screen belongs to (online; runSession passes it, #49).
  // For trying the online layout by hand without networking, ?seat=NAME does the same.
  create(data?: { localSeat?: string }): void {
    const run = currentRun();
    const reward = run.reward;
    const pending = nextPending(run);
    const local = data?.localSeat ?? new URLSearchParams(window.location.search).get("seat") ?? undefined;
    const online = local !== undefined && run.players.includes(local);
    // Redraw in place when the host reports a pick (a scene restart is only carried out at the next frame).
    watchRun(this, "reward", {
      redraw: () => {
        this.children.removeAll(true);
        this.create({ localSeat: actingSeat(currentRun()) ?? data?.localSeat });
      },
    });
    drawBackground(this);
    drawPartyHud(this, run);
    drawRunHeader(this, "Victory!", online ? null : (pending?.player ?? null), "Pick one domino for your deck, or skip. Charms too, when offered.");
    if (!reward || (pending?.type !== "reward" && pending?.type !== "charmReward")) return;
    // Single player: the seat whose turn it is to pick is large and can pick. Online: your own
    // seat is large (and first), can pick while undecided, and teammates are small.
    const active = online ? local : pending.player;
    const order = online ? [local, ...run.players.filter((p) => p !== local)] : run.players;
    const tooltip = new Tooltip(this);

    let y = 270;
    for (const id of order) {
      const isActive = id === active;
      const canPick = isActive && reward.choices[id] === undefined;
      const size: DominoSize = isActive ? "large" : "small";
      const charmOffer = reward.charmOffers[id];
      const charmChoice = reward.charmChoices[id];
      const canPickCharm = isActive && charmOffer !== undefined && charmChoice === undefined;
      const rowH = isActive ? (charmOffer ? 350 : 250) : 130;
      const cy = y + (isActive && charmOffer ? 125 : rowH / 2);
      const choice = reward.choices[id];
      const offer: Domino[] = reward.offers[id];

      if (isActive) {
        const g = this.add.graphics();
        g.fillStyle(0x2f7a5b, 0.55);
        g.fillRoundedRect(30, y, 1860, rowH - 10, 18);
        g.lineStyle(4, 0xffe14d, 1);
        g.strokeRoundedRect(30, y, 1860, rowH - 10, 18);
      }
      label(this, 60, cy - 30, seatName(id), isActive ? 40 : 30, { bold: true, color: isActive ? "#ffe14d" : "#ffffff" });
      artImage(this, "ui/coin", 44, cy + 26, 24, 24);
      label(this, 60, cy + 12, `+${reward.coinsEarned[id] ?? 0} coins  (${run.coins[id] ?? 0} total)`, isActive ? 26 : 22, { color: "#ffe9a0" });
      const done = choice !== undefined && (charmOffer === undefined || charmChoice !== undefined);
      const status = !done ? (isActive || online ? "choosing" : "waiting") : choice === SKIP ? "skipped" : "picked";
      label(this, 60, cy + 48, status, 22, { bold: true, color: !done ? "#cfe9dc" : "#8fe3a8" });

      const { w, h } = dominoPixelSize(size);
      const step = w + (isActive ? 90 : 60);
      offer.forEach((d, i) => {
        const x = 520 + i * step + w / 2;
        const decided = choice !== undefined;
        const taken = choice === d.id;
        const state = decided && !taken ? "notPlayable" : "normal";
        const c = drawDomino(this, d, size, state).setPosition(x, cy - (isActive ? 14 : 0));
        tooltip.attach(c, d);
        if (taken) {
          const g = this.add.graphics();
          g.lineStyle(6, 0x8fe3a8, 1);
          g.strokeRoundedRect(x - w / 2 - 6, c.y - h / 2 - 6, w + 12, h + 12, 14);
        }
        if (canPick) {
          c.on("pointerover", () => c.setScale(1.06));
          c.on("pointerout", () => c.setScale(1));
          c.on("pointerdown", () => submitRunChoice(this, id, { type: "reward", pick: d.id }));
        }
        drawRarity(this, x, c.y + h / 2 + (isActive ? 36 : 18), d.rarity, size);
      });
      // The charm offer (#108): after an elite 1 charm to take or skip, after a boss 3 rare ones.
      if (charmOffer) {
        const small = !isActive;
        const size = small ? 34 : 64;
        const left = small ? 1100 : 560;
        const cyc = small ? cy : y + 280;
        if (!small) label(this, 60, cyc, "Charm", 30, { bold: true, color: "#9fd1b8" });
        charmsByIds(charmOffer).forEach((ch, i) => {
          const x = left + i * (small ? 150 : 400);
          const taken = charmChoice === ch.id;
          const icon = charmWithTip(this, tooltip, ch, size, x, cyc);
          if (charmChoice !== undefined && !taken) icon.setAlpha(0.35);
          if (taken) this.add.graphics().lineStyle(5, 0x8fe3a8, 1).strokeCircle(x, cyc, size / 2 + 8);
          if (!small) {
            label(this, x + size / 2 + 16, cyc - 14, ch.name, 28, { bold: true });
            this.add.text(x + size / 2 + 16, cyc + 6, ch.description, { fontFamily: "Arial, Helvetica, sans-serif", fontSize: "20px", color: "#cfe9dc", wordWrap: { width: 290 } });
          } else {
            label(this, x + size / 2 + 8, cyc, ch.name, 18, { color: "#cfe9dc" });
          }
          if (canPickCharm) {
            icon.on("pointerdown", () => submitRunChoice(this, id, { type: "charmReward", pick: ch.id }));
            if (icon.input) icon.input.cursor = "pointer";
          }
        });
        if (small) label(this, 1100, cyc + 30, charmChoice === undefined ? "choosing a charm" : charmChoice === SKIP ? "skipped the charm" : "took a charm", 18, { color: "#cfe9dc" });
        if (canPickCharm) button(this, 1780, cyc, "Skip", () => submitRunChoice(this, id, { type: "charmReward", pick: SKIP }), { size: 40, origin: 0.5 });
      }
      if (canPick) button(this, 1650, cy, "Skip", () => submitRunChoice(this, id, { type: "reward", pick: SKIP }), { size: 40, origin: 0.5 });
      y += rowH;
    }
  }
}
