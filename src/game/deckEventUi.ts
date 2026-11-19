import Phaser from "phaser";
import { dominoUnavailable, previewDeckAction, repaintChoices } from "../engine/events/deckEvents";
import type { RepaintChoice } from "../engine/events/deckEvents";
import type { EventPick, PersonalAction } from "../engine/events/personal";
import type { RunState } from "../engine/run";
import type { Domino } from "../engine/types";
import { deckViewerState, openDeckViewer, runDeckPlayers } from "./deckViewer";
import { drawDomino } from "./dominoDrawing";
import { Tooltip } from "./tooltip";
import { FONT, button, label } from "./ui";

// The screens for the three events that change dominoes (#90): the Tinker's Bench, the Mirror Pond
// and the Twin Forge. EventScene calls startDeckAction when a player picks one of their options.
// The domino picker is the deck viewer (#87); which dominoes can be picked, what a repaint can
// change and every before-and-after preview come from src/engine/events/deckEvents.ts. This file
// only draws them and hands the finished pick back to be sent as the player's choice.

export const DECK_EVENTS = ["tinkers_bench", "mirror_pond", "twin_forge"];

// Short names for the options, and the prompt over the picker.
export const ACTION_LABEL: Record<PersonalAction, string> = {
  skip: "Skip",
  flip: "Flip a domino (free)",
  repaint: "Repaint a spark",
  copy: "Copy a domino",
  weld: "Weld two dominoes",
  wish: "Turn over a domino",
};
const PROMPT: Record<string, string> = {
  flip: "Pick a domino to flip: its intake and output swap.",
  repaint: "Pick a domino to repaint.",
  copy: "Pick a domino to copy.",
  weld: "Pick two: the first gives intake and effect, the second gives its output.",
};

// A player chose a deck option: open the picker; once they confirm, call submit with their pick.
export function startDeckAction(scene: Phaser.Scene, run: RunState, player: string, action: PersonalAction, submit: (pick: EventPick) => void): void {
  const deck = runDeckPlayers(run).filter((p) => p.id === player);
  openDeckViewer(scene, deck, player, undefined, {
    count: action === "weld" ? 2 : 1,
    prompt: PROMPT[action],
    whyNot: (d) => dominoUnavailable(run, player, action, d.id),
    preview: (picked) => {
      if (action === "repaint") return null;
      try {
        return previewDeckAction(run, player, action, { dominoes: picked });
      } catch {
        return null;
      }
    },
    onConfirm: (picked) => {
      if (action === "repaint") openRepaint(scene, run, player, picked[0], submit);
      else submit({ dominoes: picked });
    },
  });
}

// ---- the repaint chooser ----

const PANEL = { x: 260, y: 110, w: 1400, h: 860 };

function choiceText(c: RepaintChoice): string {
  return `${c.half === "intake" ? "Intake" : "Output"}: ${c.from} to ${c.spark}`;
}

function openRepaint(scene: Phaser.Scene, run: RunState, player: string, id: string, submit: (pick: EventPick) => void): void {
  const domino = run.dominoes.find((d) => d.id === id) as Domino;
  const choices = repaintChoices(run, player, id);
  let selected: RepaintChoice | null = null;
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
    c.add(label(scene, PANEL.x + 40, PANEL.y + 50, "Repaint a spark", 48, { bold: true }));
    c.add(label(scene, PANEL.x + 40, PANEL.y + 110, "Pick which spark to change and what it becomes.", 28, { color: "#ffe14d", bold: true }));
    const shown = drawDomino(scene, domino, "large", "normal").setPosition(PANEL.x + 190, PANEL.y + 260);
    tooltip.attach(shown, domino);
    c.add(shown);
    choices.forEach((choice, i) => {
      const x = PANEL.x + 400 + Math.floor(i / 7) * 480;
      const y = PANEL.y + 220 + (i % 7) * 66;
      c.add(button(scene, x, y, choiceText(choice), () => { selected = choice; draw(); }, { size: 28, selected: choice === selected }));
    });
    if (selected) {
      const pick = { dominoes: [id], half: selected.half, slot: selected.slot, spark: selected.spark };
      const { before, after } = previewDeckAction(run, player, "repaint", pick);
      const b = drawDomino(scene, before[0], "large", "normal").setScale(0.8).setPosition(PANEL.x + 400, PANEL.y + 720);
      const a = drawDomino(scene, after, "large", "normal").setScale(0.8).setPosition(PANEL.x + 900, PANEL.y + 720);
      tooltip.attach(b, before[0]);
      tooltip.attach(a, after);
      c.add([b, a, scene.add.text(PANEL.x + 650, PANEL.y + 720, ">", { fontFamily: FONT, fontSize: "56px", color: "#ffe14d", fontStyle: "bold" }).setOrigin(0.5)]);
    }
    c.add(button(scene, PANEL.x + PANEL.w - 40, PANEL.y + 800, "Confirm", () => { const s = selected; close(); if (s) submit({ dominoes: [id], half: s.half, slot: s.slot, spark: s.spark }); }, { size: 34, origin: 1, disabled: selected === null }));
    c.add(button(scene, PANEL.x + PANEL.w - 220, PANEL.y + 800, "Cancel", close, { size: 34, origin: 1 }));
  }
  draw();
}

// ---- illustrations (code-drawn placeholders, drawn inside the panel x, y, w, h) ----

type Illustration = (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) => void;

const drawBench: Illustration = (g, x, y, w, h) => {
  const ground = y + h * 0.72;
  g.fillStyle(0x8cc6e0, 1);
  g.fillRect(x, y, w, ground - y);
  g.fillStyle(0x6a9f4f, 1);
  g.fillRect(x, ground, w, y + h - ground);
  // The bench.
  g.fillStyle(0x8a5a2b, 1);
  g.fillRect(x + w * 0.15, ground - 120, w * 0.7, 26);
  g.fillRect(x + w * 0.2, ground - 94, 24, 110);
  g.fillRect(x + w * 0.8 - 24, ground - 94, 24, 110);
  // A gear, a hammer and a kettle on top.
  g.fillStyle(0x9a9a9a, 1);
  g.fillCircle(x + w * 0.3, ground - 160, 38);
  g.fillStyle(0x8cc6e0, 1);
  g.fillCircle(x + w * 0.3, ground - 160, 14);
  g.fillStyle(0x7a5430, 1);
  g.fillRect(x + w * 0.45, ground - 170, 12, 50);
  g.fillStyle(0x666666, 1);
  g.fillRect(x + w * 0.45 - 20, ground - 182, 52, 22);
  g.fillStyle(0xb5483b, 1);
  g.fillRoundedRect(x + w * 0.65, ground - 190, 80, 66, 16);
  g.fillRect(x + w * 0.65 + 70, ground - 170, 30, 10);
};

const drawPond: Illustration = (g, x, y, w, h) => {
  g.fillStyle(0x24305e, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(0xfff2b0, 1);
  g.fillCircle(x + w * 0.75, y + h * 0.15, 46);
  g.fillStyle(0x3b6b4a, 1);
  g.fillRect(x, y + h * 0.4, w, h * 0.12);
  // The pond, and the moon and a tree reflected in it.
  g.fillStyle(0x4f86b8, 1);
  g.fillEllipse(x + w / 2, y + h * 0.75, w * 0.85, h * 0.4);
  g.fillStyle(0xfff2b0, 0.7);
  g.fillEllipse(x + w * 0.62, y + h * 0.72, 80, 30);
  g.fillStyle(0x1f4d33, 0.7);
  g.fillTriangle(x + w * 0.3, y + h * 0.66, x + w * 0.4, y + h * 0.66, x + w * 0.35, y + h * 0.84);
};

const drawForge: Illustration = (g, x, y, w, h) => {
  const ground = y + h * 0.75;
  g.fillStyle(0x3a2f3f, 1);
  g.fillRect(x, y, w, h);
  g.fillStyle(0x58506a, 1);
  g.fillRect(x, ground, w, y + h - ground);
  // Two anvils facing each other, a fire between them.
  g.fillStyle(0x777777, 1);
  g.fillRect(x + w * 0.1, ground - 100, w * 0.25, 40);
  g.fillRect(x + w * 0.17, ground - 60, w * 0.11, 60);
  g.fillRect(x + w * 0.65, ground - 100, w * 0.25, 40);
  g.fillRect(x + w * 0.72, ground - 60, w * 0.11, 60);
  g.fillStyle(0xff7a2f, 1);
  g.fillTriangle(x + w * 0.4, ground, x + w * 0.6, ground, x + w * 0.5, ground - 190);
  g.fillStyle(0xffd23f, 1);
  g.fillTriangle(x + w * 0.45, ground, x + w * 0.55, ground, x + w * 0.5, ground - 110);
};

export const DECK_ILLUSTRATIONS: Record<string, Illustration> = { tinkers_bench: drawBench, mirror_pond: drawPond, twin_forge: drawForge };
