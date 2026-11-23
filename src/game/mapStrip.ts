import Phaser from "phaser";
import presentation from "../../data/presentation.json";
import { getPendingRunChoices } from "../engine/run";
import type { RunState } from "../engine/run";
import { drawBar, drawPlate, kitButton } from "./kit";
import { drawStripPlate, stripLayout } from "./combatHud";
import { lookOf, wizardPortrait } from "./battleWizards";
import { coinLine } from "./coinIcon";
import { drawSparkGlyph } from "./dominoDrawing";
import { drawBlessedGlow } from "./sparkShrineArt";
import { fitText } from "./combatCtx";
import { fontRole, snap } from "./fonts";
import { relay } from "./relay";
import { actingSeat, isOnlineRun, onlineRun, seatName } from "./runSession";
import { seatColour } from "./seatColours";
import { shortName } from "./ui";

// The map screen's bottom strip (#307): the combat screen's strip plate and party health bar (combatHud.ts,
// combatLayout.strip), then one plate per player (head, name, coins and, online, "voted" or "choosing"), and
// on the right who has voted and who the table is waiting for, the host's "Playing for" and the reconnect line.
// Draws what the run says; positions and texts are in data/presentation.json (map.strip).

const M = presentation.map.strip;
const U = presentation.kit.unit;
const P = stripLayout.party;

function text(scene: Phaser.Scene, x: number, y: number, s: string, size: number, colour: string, originX = 0): Phaser.GameObjects.Text {
  return snap(scene.add.text(Math.round(x), Math.round(y), s, { ...fontRole(size), color: colour }).setOrigin(originX, 0.5));
}

export function drawMapStrip(scene: Phaser.Scene, run: RunState): void {
  drawStripPlate(scene.add.graphics());

  // The party's health, and the Spark Shrine's blessing under it.
  text(scene, P.x, P.labelY, P.label, P.labelSize, P.labelColour);
  drawBar(scene, P.x, P.barY, P.barW, { kind: "health", value: run.health, max: run.maxHealth, number: `${run.health} / ${run.maxHealth}` });
  if (run.blessing) {
    const B = M.blessing;
    const g = scene.add.graphics();
    drawBlessedGlow(g, run.blessing, B.x + B.r, B.y, B.r);
    drawSparkGlyph(g, run.blessing, B.x + B.r, B.y, B.r);
    text(scene, B.x + B.r * 2 + B.gap, B.y, `Blessed ${run.blessing}`, B.size, B.colour);
  }

  drawPlayers(scene, run);
  drawVotesLine(scene, run);
}

// One kit plate per player, its edge in the seat's colour.
function drawPlayers(scene: Phaser.Scene, run: RunState): void {
  const L = M.plates;
  const online = isOnlineRun() && run.phase === "vote";
  const g = scene.add.graphics();
  run.players.forEach((id, i) => {
    const x = L.x + i * (L.w * U + L.gap);
    const colour = seatColour(run.players, id);
    drawPlate(g, x, L.y, L.w, L.h, "#" + colour.toString(16).padStart(6, "0"));
    const head = scene.add.container(0, 0);
    wizardPortrait(scene, head, lookOf(run.players, id), x + M.portrait.dx, L.y + M.portrait.dy);
    const name = text(scene, x + M.name.dx, L.y + M.name.dy, shortName(seatName(id), M.name.letters), M.name.size, M.name.colour);
    fitText(name, L.w * U - M.name.dx - 12);
    coinLine(scene, x + M.name.dx, L.y + M.coins.dy, [run.coins[id] ?? 0], M.coins.size, { color: M.coins.colour });
    if (online) {
      const tag = run.votes[id] === undefined ? M.tag.choosing : M.tag.voted;
      text(scene, x + M.name.dx, L.y + M.tag.dy, tag.text, M.tag.size, tag.colour);
    }
  });
}

// On the right: "2 of 4 have voted", who the table is waiting for, "Playing for [name]" when the host plays for an
// away player, and the reconnect line with the host's Play for button.
function drawVotesLine(scene: Phaser.Scene, run: RunState): void {
  const online = onlineRun();
  if (!online) return;
  const R = M.right;
  const T = M.text;
  let y = R.y - 12; // the first row's top
  const row = (s: string, colour: string): void => {
    const t = snap(scene.add.text(R.x, y, s, { ...fontRole(R.size), color: colour, wordWrap: { width: R.wrap } }).setOrigin(0, 0));
    y += Math.max(R.rowH, t.height + 6);
  };
  if (run.phase === "vote") {
    const voted = run.players.filter((id) => run.votes[id] !== undefined).length;
    row(`${voted} ${T.of} ${run.players.length} ${T.voted}`, R.colour);
    const waiting = [...new Set(getPendingRunChoices(run).map((p) => seatName(p.player)))];
    if (waiting.length > 0) row(`${T.waiting} ${waiting.join(", ")}`, R.waitColour);
  }
  const acting = actingSeat(run);
  if (acting !== null && acting !== online.seat) row(`${T.playing} ${seatName(acting)}`, R.playingColour);
  const paused = relay.paused;
  if (paused && paused.waitingFor !== null) {
    row(`${T.waiting} ${paused.waitingFor} ${T.reconnect}`, R.pauseColour);
    const seat = paused.playFor;
    const host = online.host;
    if (host && seat) kitButton(scene, M.button.x, M.button.y, `${T.playFor} ${seatName(seat)}`, () => host.playFor(seat));
  }
}
