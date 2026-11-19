import Phaser from "phaser";
import { applyRunChoice } from "../engine/run";
import { bossTip, passiveText } from "./bossInfo";
import { content } from "./devBattle";
import { drawPartyHud, drawRunHeader, drawWaitingFor } from "./partyHud";
import { currentRun, isOnlineRun, myPending, openRunScreen, setRun, submitRunChoice, watchRun } from "./runSession";
import { Tooltip } from "./tooltip";
import { button, drawBackground, label } from "./ui";

// The screen between acts: the act just finished, what the heal restored and the next act's boss
// with its passive. Everything comes from the run (actStart, map.bossId) and the enemy's data.
// Single player: one Continue, sent for every seat. Online: each player presses Continue and the
// run moves on to the map once all have.

export class ActStartScene extends Phaser.Scene {
  constructor() {
    super("actStart");
  }

  create(): void {
    this.render();
    watchRun(this, "actStart", { redraw: () => this.render() });
  }

  private render(): void {
    this.children.removeAll(true);
    const run = currentRun();
    const pending = myPending(run);
    const total = run.content.run.acts.length;
    drawBackground(this);
    drawPartyHud(this, run);
    drawRunHeader(this, `Act ${run.actIndex} of ${total} complete`, null, "");
    label(this, 960, 260, `Act ${run.actIndex + 1} of ${total}`, 96, { bold: true, origin: 0.5, color: "#ffe14d" });
    const heal = run.actStart?.heal ?? 0;
    label(this, 960, 400, heal > 0 ? `The party rests and heals ${heal}.` : "The party is already at full health.", 40, { origin: 0.5, color: "#9fd1b8" });
    label(this, 960, 470, `Health ${run.health} / ${run.maxHealth}`, 32, { origin: 0.5 });

    const boss = content.enemies.find((e) => e.id === run.map.bossId);
    label(this, 960, 600, "This act's boss", 30, { origin: 0.5, color: "#9fd1b8" });
    const name = label(this, 960, 660, boss?.name ?? run.map.bossId, 56, { bold: true, origin: 0.5 });
    const passives = label(this, 960, 720, passiveText(boss), 32, { origin: 0.5, color: "#ffe14d" });
    const tip = new Tooltip(this);
    for (const target of [name, passives]) tip.attachLines(target, bossTip(boss));

    if (pending?.type === "act") {
      button(this, 960, 880, "Continue", () => this.next(pending.player), { size: 48, origin: 0.5 });
    } else if (isOnlineRun()) {
      drawWaitingFor(this, run, 960, 880, 0.5);
    }
  }

  private next(player: string): void {
    if (isOnlineRun()) return submitRunChoice(this, player, { type: "act" });
    let result = currentRun();
    for (const seat of result.players) result = applyRunChoice(result, seat, { type: "act" }).run;
    setRun(result);
    openRunScreen(this);
  }
}
