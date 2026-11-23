import Phaser from "phaser";
import { prizeFor, upgradeChoices, wellStage } from "../engine/events/wishingWell";
import type { PrizeKind } from "../engine/events/wishingWell";
import type { EventPick } from "../engine/events/personal";
import type { EventState } from "../engine/eventStops";
import type { RunState } from "../engine/run";
import { previewUpgrade } from "../engine/upgrades";
import type { Domino, EventData, Spark } from "../engine/types";
import { deckViewerState, openDeckViewer, runDeckPlayers } from "./deckViewer";
import { drawDomino } from "./dominoDrawing";
import { coinButton, coinLine } from "./coinIcon";
import type { CoinPart } from "./coinIcon";
import { Tooltip } from "./tooltip";
import { button, label } from "./ui";
import { fontRole } from "./fonts";

// The screens for the Wishing Well (#91). EventScene calls drawWellStage for a player who has
// already turned a domino over. Which domino came up, which prize each spark gives, what can be
// removed or upgraded and the offered rares all come from the engine (src/engine/events/
// wishingWell.ts); this file draws them and hands each pick back to be sent as the player's choice.

const GOLD = "#ffe14d";

// What a prize kind means, for the buttons and the summary.
// The same as parts, for a coin prize to show with the icon.
export function prizeParts(kind: PrizeKind | "none", data: EventData): CoinPart[] {
  return kind === "coins" ? [data.numbers.coinPrize] : [prizeText(kind, data)];
}

export function prizeText(kind: PrizeKind | "none", data: EventData): string {
  if (kind === "remove") return "remove a domino from your deck";
  if (kind === "upgrade") return "a free upgrade";
  if (kind === "rare") return "a choice of rare dominoes";
  return "nothing";
}

// The player has turned a domino over: show it and what they must do next. Returns the y below it.
export function drawWellStage(scene: Phaser.Scene, run: RunState, event: EventState, player: string, data: EventData, x: number, top: number, send: (pick: EventPick) => void, tooltip: Tooltip): number {
  const well = event.wells![player];
  const stage = wellStage(run, player);
  let y = top;
  const turned = drawDomino(scene, well.domino, "large", "normal").setPosition(x + 120, y + 60);
  tooltip.attach(turned, well.domino);
  label(scene, x + 290, y + 20, "You turned over", 28, { color: "#cfe9dc" });
  label(scene, x + 290, y + 64, well.domino.name, 34, { bold: true });
  y += 170;
  if (stage === "spark") {
    label(scene, x, y, "It gives off two sparks. Pick the one that counts:", 30, { color: GOLD, bold: true });
    y += 60;
    for (const spark of well.domino.output) {
      coinButton(scene, x, y, [`${spark}: `, ...prizeParts(prizeFor(run, spark), data)], () => send({ dominoes: [], spark }), { size: 32 });
      y += 80;
    }
  } else if (well.spark !== null) {
    coinLine(scene, x, y, [`${well.spark}: `, ...prizeParts(prizeFor(run, well.spark), data)], 32, { color: GOLD, bold: true });
    y += 60;
    if (stage === "remove") {
      button(scene, x, y, "Pick a domino to remove", () => pickToRemove(scene, run, player, send), { size: 32 });
      y += 80;
    } else if (stage === "upgrade") {
      button(scene, x, y, "Pick a domino to upgrade", () => pickToUpgrade(scene, run, player, send), { size: 32 });
      y += 80;
    } else if (stage === "rare") {
      (well.offers ?? []).forEach((offer, i) => {
        const ox = x + 120 + i * 300;
        const c = drawDomino(scene, offer, "large", "normal").setPosition(ox, y + 60);
        tooltip.attach(c, offer);
        button(scene, ox - 60, y + 150, "Take", () => send({ dominoes: [], offer: offer.id }), { size: 30 });
      });
      y += 230;
    }
  }
  return y;
}

function pickToRemove(scene: Phaser.Scene, run: RunState, player: string, send: (pick: EventPick) => void): void {
  openDeckViewer(scene, runDeckPlayers(run).filter((p) => p.id === player), player, undefined, {
    count: 1,
    prompt: "Pick a domino to remove from your deck.",
    onConfirm: (picked) => send({ dominoes: picked }),
  });
}

function pickToUpgrade(scene: Phaser.Scene, run: RunState, player: string, send: (pick: EventPick) => void): void {
  openDeckViewer(scene, runDeckPlayers(run).filter((p) => p.id === player), player, undefined, {
    count: 1,
    prompt: "Pick a domino to upgrade.",
    whyNot: (d) => (upgradeChoices(run, player, d.id).length > 0 ? null : "Can't be upgraded"),
    onConfirm: (picked) => openUpgradeChooser(scene, run, player, picked[0], send),
  });
}

// ---- the upgrade chooser: which side (and added spark), with a before and after ----

const PANEL = { x: 260, y: 110, w: 1400, h: 860 };

function choiceText(c: { side: "left" | "right"; spark?: Spark }): string {
  return c.side === "left" ? `Left: also take ${c.spark}` : "Right: stronger effect";
}

function openUpgradeChooser(scene: Phaser.Scene, run: RunState, player: string, id: string, send: (pick: EventPick) => void): void {
  const domino = run.dominoes.find((d) => d.id === id) as Domino;
  const choices = upgradeChoices(run, player, id);
  let selected: (typeof choices)[number] | null = null;
  deckViewerState.open = true; // holds an online redraw until this is closed, like the deck viewer
  const root = scene.add.container(0, 0).setDepth(900);
  const tooltip = new Tooltip(scene);
  let body: Phaser.GameObjects.Container | undefined;

  const close = () => {
    tooltip.hide();
    root.destroy(true);
    deckViewerState.open = false;
    const later = deckViewerState.onClose;
    deckViewerState.onClose = null;
    later?.();
  };

  const dim = scene.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.7).setInteractive();
  const panel = scene.add.graphics();
  panel.fillStyle(0x1e5a42, 1);
  panel.fillRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 24);
  panel.lineStyle(4, 0x2f7a5b, 1);
  panel.strokeRoundedRect(PANEL.x, PANEL.y, PANEL.w, PANEL.h, 24);
  root.add([dim, panel]);

  function draw(): void {
    tooltip.hide();
    body?.destroy(true);
    const c = scene.add.container(0, 0);
    body = c;
    root.add(c);
    c.add(label(scene, PANEL.x + 40, PANEL.y + 50, "Free upgrade", 48, { bold: true }));
    c.add(label(scene, PANEL.x + 40, PANEL.y + 110, "Pick which side to upgrade.", 28, { color: GOLD, bold: true }));
    const shown = drawDomino(scene, domino, "large", "normal").setPosition(PANEL.x + 190, PANEL.y + 260);
    tooltip.attach(shown, domino);
    c.add(shown);
    choices.forEach((choice, i) => {
      c.add(button(scene, PANEL.x + 400, PANEL.y + 220 + i * 66, choiceText(choice), () => { selected = choice; draw(); }, { size: 28, selected: choice === selected }));
    });
    if (selected) {
      const { before, after } = previewUpgrade(run, player, id, selected.side, selected.spark);
      const b = drawDomino(scene, before, "large", "normal").setScale(0.8).setPosition(PANEL.x + 400, PANEL.y + 720);
      const a = drawDomino(scene, after, "large", "normal").setScale(0.8).setPosition(PANEL.x + 900, PANEL.y + 720);
      tooltip.attach(b, before);
      tooltip.attach(a, after);
      c.add([b, a, scene.add.text(PANEL.x + 650, PANEL.y + 720, ">", { ...fontRole(56), color: GOLD }).setOrigin(0.5)]);
    }
    c.add(button(scene, PANEL.x + PANEL.w - 40, PANEL.y + 800, "Confirm", () => { const s = selected; close(); if (s) send({ dominoes: [id], side: s.side, spark: s.spark }); }, { size: 34, origin: 1, disabled: selected === null }));
    c.add(button(scene, PANEL.x + PANEL.w - 220, PANEL.y + 800, "Cancel", close, { size: 34, origin: 1 }));
  }
  draw();
}

// ---- illustration (a code-drawn placeholder, drawn inside the panel x, y, w, h) ----

export function drawWell(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const ground = y + h * 0.75;
  g.fillStyle(0x2a3a6a, 1);
  g.fillRect(x, y, w, ground - y);
  g.fillStyle(0xfff2b0, 1);
  g.fillCircle(x + w * 0.2, y + h * 0.15, 40);
  g.fillStyle(0x4f7a4a, 1);
  g.fillRect(x, ground, w, y + h - ground);
  // The well: a stone ring, dark water, a roof on two posts, a rope and a bucket.
  const cx = x + w / 2;
  g.fillStyle(0x8a8a8a, 1);
  g.fillRoundedRect(cx - 130, ground - 110, 260, 130, 20);
  g.fillStyle(0x10203a, 1);
  g.fillEllipse(cx, ground - 110, 220, 50);
  g.fillStyle(0x7a5430, 1);
  g.fillRect(cx - 120, ground - 320, 14, 210);
  g.fillRect(cx + 106, ground - 320, 14, 210);
  g.fillStyle(0xb5483b, 1);
  g.fillTriangle(cx - 160, ground - 320, cx + 160, ground - 320, cx, ground - 410);
  g.lineStyle(4, 0xd9c9a0, 1);
  g.lineBetween(cx, ground - 320, cx, ground - 190);
  g.fillStyle(0x6b4a2a, 1);
  g.fillRect(cx - 22, ground - 190, 44, 36);
  // A few sparks rising from the water.
  g.fillStyle(0xffe14d, 0.9);
  g.fillCircle(cx - 40, ground - 140, 6);
  g.fillCircle(cx + 30, ground - 165, 5);
  g.fillCircle(cx + 5, ground - 130, 4);
}
