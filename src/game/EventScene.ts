import Phaser from "phaser";
import { applyRunChoice } from "../engine/run";
import type { RunEvent, RunState } from "../engine/run";
import type { EventOption, EventState } from "../engine/eventStops";
import type { EventData } from "../engine/types";
import { drawDomino } from "./dominoDrawing";
import { scaleTime } from "./playbackSpeed";
import { drawPartyHud, drawWaitingFor } from "./partyHud";
import { currentRun, isOnlineRun, myPending, openRunScreen, seatName, setRun, submitRunChoice, watchRun } from "./runSession";
import { Tooltip } from "./tooltip";
import { drawTollBridge } from "./tollBridgeArt";
import { PLAYER_COLORS, button, drawBackground, label } from "./ui";

// The event screen (#87), used by every event. Illustration (drawn in code, one per event) on the
// left; title, story text and choices on the right. The story text comes from data/events.json and
// the options, votes, winner and odds from the run engine; this screen only draws them and sends
// "event" choices. Party votes: each option shows who has voted for it, live; when the vote settles
// the winner is shown, with the odds if it was drawn. In single player the party vote is asked once
// and sent as every seat's vote. Online everyone votes at once on their own screen.
// Personal events, pushing your luck and the domino picker come with the events that use them.

const TEXT_X = 820;
const GOLD = "#ffe14d";

function eventData(run: RunState, id: string): EventData {
  const data = run.content.events.find((e) => e.id === id);
  if (!data) throw new Error(`no event ${id} in data/events.json`);
  return data;
}

function optionText(option: EventOption): string {
  if (option.type === "toll") {
    if (option.action === "pay") return `Pay the toll: ${option.amount} coins each`;
    return option.action === "fight" ? "Fight the troll (hard fight)" : "Turn back";
  }
  if (option.type === "player") return `${seatName(option.player)} takes the domino`;
  return `Everyone takes ${option.amount} coins`;
}

// The placeholder illustration for each event, drawn inside the panel (x, y, w, h).
type Illustration = (g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) => void;

// A courier sitting on a milestone by a road, a parcel in their lap.
const drawCourier: Illustration = (g, x, y, w, h) => {
  const ground = y + h * 0.7;
  g.fillStyle(0x6fb3d9, 1);
  g.fillRect(x, y, w, ground - y);
  g.fillStyle(0xfff2b0, 1);
  g.fillCircle(x + w * 0.8, y + h * 0.18, 50);
  g.fillStyle(0x4f9a5c, 1);
  g.fillRect(x, ground, w, y + h - ground);
  // The road, narrowing to the horizon.
  g.fillStyle(0xc9a874, 1);
  g.fillTriangle(x + w * 0.42, ground, x + w * 0.58, ground, x + w * 0.85, y + h);
  g.fillTriangle(x + w * 0.42, ground, x + w * 0.85, y + h, x + w * 0.15, y + h);
  // The milestone.
  const mx = x + w * 0.3;
  g.fillStyle(0x9a9a9a, 1);
  g.fillRoundedRect(mx - 55, ground - 120, 110, 150, { tl: 55, tr: 55, bl: 8, br: 8 });
  g.lineStyle(4, 0x555555, 1);
  g.strokeRoundedRect(mx - 55, ground - 120, 110, 150, { tl: 55, tr: 55, bl: 8, br: 8 });
  // The courier: body, head, hat, and the parcel.
  g.fillStyle(0xb5483b, 1);
  g.fillRoundedRect(mx - 30, ground - 205, 60, 90, 14);
  g.fillStyle(0xf2c9a0, 1);
  g.fillCircle(mx, ground - 225, 26);
  g.fillStyle(0x2f4a8f, 1);
  g.fillRect(mx - 32, ground - 250, 64, 14);
  g.fillRect(mx - 20, ground - 272, 40, 24);
  g.fillStyle(0xc89a5b, 1);
  g.fillRect(mx - 26, ground - 150, 52, 40);
  g.lineStyle(4, 0x8a6a3a, 1);
  g.strokeRect(mx - 26, ground - 150, 52, 40);
  g.lineBetween(mx, ground - 150, mx, ground - 110);
  // A signpost pointing nowhere in particular.
  g.fillStyle(0x7a5430, 1);
  g.fillRect(x + w * 0.72, ground - 150, 10, 190);
  g.fillTriangle(x + w * 0.72 + 10, ground - 150, x + w * 0.72 + 90, ground - 130, x + w * 0.72 + 10, ground - 110);
  g.fillTriangle(x + w * 0.72, ground - 90, x + w * 0.72 - 80, ground - 70, x + w * 0.72, ground - 50);
};

// Every other event gets its own drawing when it is turned on; until then, a question mark.
const drawUnknown: Illustration = (g, x, y, w, h) => {
  g.fillStyle(0x4a5a9a, 1);
  g.fillRect(x, y, w, h);
  g.lineStyle(24, 0xf4ecd8, 1);
  g.beginPath();
  g.arc(x + w / 2, y + h * 0.4, 90, Phaser.Math.DegToRad(180), Phaser.Math.DegToRad(450), false);
  g.lineTo(x + w / 2, y + h * 0.65);
  g.strokePath();
  g.fillStyle(0xf4ecd8, 1);
  g.fillCircle(x + w / 2, y + h * 0.78, 16);
};

const ILLUSTRATIONS: Record<string, Illustration> = { lost_courier: drawCourier, toll_bridge: drawTollBridge };

export class EventScene extends Phaser.Scene {
  private resolving = false;

  constructor() {
    super("event");
  }

  create(): void {
    this.resolving = false;
    this.build();
  }

  // Draws the screen. Online it runs again, in place, whenever the host reports a new vote or status
  // (a scene restart is only carried out at the next frame, which could wipe the result display).
  private build(): void {
    const run = currentRun();
    const event = run.event;
    drawBackground(this);
    drawPartyHud(this, run);
    watchRun(this, "event", {
      redraw: () => {
        this.tweens.killAll();
        this.children.removeAll(true);
        this.build();
      },
      onUpdate: (events) => {
        const outcome = events.find((e) => e.type === "eventOutcome");
        if (outcome === undefined || outcome.type !== "eventOutcome" || !event) return false;
        this.showResult(event, outcome, events);
        return true;
      },
      busy: () => this.resolving,
    });
    if (!event) return;
    const data = eventData(run, event.id);
    this.drawIllustration(event.id);
    label(this, TEXT_X, 90, data.name, 56, { bold: true });
    const text = this.add.text(TEXT_X, 150, data.text, { fontFamily: "Arial, Helvetica, sans-serif", fontSize: "30px", color: "#cfe9dc", wordWrap: { width: 920 } });
    if (event.kind === "vote") this.drawVote(run, event, 150 + text.height + 30);
  }

  private drawIllustration(id: string): void {
    const g = this.add.graphics();
    const x = 60;
    const y = 220;
    const w = 700;
    const h = 740;
    (ILLUSTRATIONS[id] ?? drawUnknown)(g, x, y, w, h);
    g.lineStyle(6, 0xf4ecd8, 1);
    g.strokeRect(x, y, w, h);
  }

  // A party vote: the shared domino (if the event has one) above one button per option, each with the
  // players who have voted for it.
  private drawVote(run: RunState, event: EventState, top: number): void {
    const pending = myPending(run);
    const online = isOnlineRun();
    const tooltip = new Tooltip(this);
    let y = top;
    if (!online && pending !== null) label(this, TEXT_X, y + 10, "The party's choice", 40, { bold: true, color: GOLD });
    y += 60;
    if (event.domino) {
      const c = drawDomino(this, event.domino, "large", "normal").setPosition(TEXT_X + 120, y + 60);
      tooltip.attach(c, event.domino);
      label(this, TEXT_X + 290, y + 40, event.domino.name, 34, { bold: true });
      label(this, TEXT_X + 290, y + 84, `${event.domino.rarity ?? "rare"} domino`, 26, { color: "#ffd86b" });
      y += 200;
    }
    const me = online ? (pending?.player ?? null) : null;
    const mine = me !== null ? event.choices[me] : undefined;
    event.options.forEach((option, i) => {
      const rowY = y + i * 80;
      const canVote = pending !== null && mine === undefined && !this.resolving;
      button(this, TEXT_X, rowY, optionText(option), () => this.castVote(run, pending!.player, i), { size: 32, disabled: !canVote, selected: mine === i });
      this.drawVoters(run, event.choices, i, 1330, rowY);
    });
    if (online && pending === null) drawWaitingFor(this, run, TEXT_X, y + event.options.length * 80 + 20);
  }

  // A marker per voter in their seat colour with their seat number, then their names.
  // Single player has no voting (one pick for the party), so there is nothing to show.
  private drawVoters(run: RunState, choices: Record<string, number>, option: number, x: number, y: number): void {
    if (!isOnlineRun()) return;
    const voters = run.players.filter((id) => choices[id] === option);
    voters.forEach((id, k) => {
      const index = run.players.indexOf(id);
      const mx = x + k * 38;
      this.add.circle(mx, y, 16, PLAYER_COLORS[index % PLAYER_COLORS.length]).setStrokeStyle(3, 0x0d2a20);
      label(this, mx, y, String(index + 1), 20, { bold: true, color: "#0d2a20", origin: 0.5 });
    });
    if (voters.length > 0) label(this, x + voters.length * 38 + 6, y, voters.map(seatName).join(", "), 22, { color: "#cfe9dc" });
  }

  // Sends the vote. Online the host settles it and the screen follows when its update arrives.
  // Single player: one pick, submitted as the same vote for every seat.
  private castVote(run: RunState, player: string, option: number): void {
    if (this.resolving) return;
    if (isOnlineRun()) return submitRunChoice(this, player, { type: "event", option });
    let result = applyRunChoice(run, player, { type: "event", option });
    for (const seat of run.players) {
      if (seat === player) continue;
      const more = applyRunChoice(result.run, seat, { type: "event", option });
      result = { run: more.run, events: [...result.events, ...more.events] };
    }
    const outcome = result.events.find((e) => e.type === "eventOutcome");
    if (outcome === undefined || outcome.type !== "eventOutcome" || !run.event) {
      setRun(result.run);
      openRunScreen(this);
      return;
    }
    this.showResult(run.event, outcome, result.events, result.run);
  }

  // The vote is settled: show the final votes, the winner and, if it was drawn, the odds; then go on.
  private showResult(event: EventState, outcome: Extract<RunEvent, { type: "eventOutcome" }>, events: RunEvent[], next?: RunState): void {
    this.resolving = true;
    this.tweens.killAll();
    this.children.removeAll(true);
    const run = currentRun();
    // The votes already known, plus the last ones that came with this update.
    const choices = { ...event.choices };
    for (const e of events) if (e.type === "eventChoice") choices[e.player] = e.option;
    drawBackground(this);
    drawPartyHud(this, run);
    this.drawIllustration(event.id);
    const data = eventData(run, event.id);
    label(this, TEXT_X, 90, data.name, 56, { bold: true });
    if (event.domino) {
      const c = drawDomino(this, event.domino, "large", "normal").setPosition(TEXT_X + 120, 230);
      new Tooltip(this).attach(c, event.domino);
    }
    event.options.forEach((option, i) => {
      const y = 360 + i * 80;
      const won = i === outcome.winner;
      label(this, TEXT_X, y, optionText(option), 32, { bold: won, color: won ? "#7dffb0" : "#9fb8aa" });
      this.drawVoters(run, choices, i, 1330, y);
    });
    const y = 360 + event.options.length * 80 + 40;
    label(this, TEXT_X, y, `Winner: ${optionText(outcome.option)}`, 36, { bold: true, color: "#7dffb0" });
    if (outcome.drawn) {
      const total = Object.values(outcome.counts).reduce((a, b) => a + b, 0);
      const odds = Math.round((100 * (outcome.counts[outcome.winner] ?? 0)) / total);
      label(this, TEXT_X, y + 50, `Drawn: ${optionText(outcome.option)}, ${odds}%`, 36, { bold: true, color: "#ff9d7a" });
    }
    this.time.delayedCall(scaleTime(2200), () => {
      if (next) setRun(next);
      openRunScreen(this);
    });
  }
}
