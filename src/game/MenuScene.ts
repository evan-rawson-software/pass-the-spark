import Phaser from "phaser";
import { MAX_NAME_LENGTH } from "../net/host";
import { debugPanel } from "./DebugPanel";
import { loadProfile, resetProfile } from "./profile";
import { drawXpBar } from "./xpBar";
import type { XpBar } from "./xpBar";
import { button, drawBackground, label, saveName, savedName, textInput } from "./ui";

// The start screen (#33): host online, join, or single player.

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("menu");
  }

  create(): void {
    debugPanel.setEnabled(true);
    // Back at the start: the address bar no longer points at a room.
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      // not allowed here
    }
    drawBackground(this);
    label(this, 960, 110, "Pass the Spark", 96, { bold: true, origin: 0.5 });

    const bar = drawXpBar(this, 960, 215, 700, loadProfile().experience);

    label(this, 960, 345, "Your name (for online games)", 30, { origin: 0.5 });
    const nameEl = textInput(this, 960, 400, savedName(), MAX_NAME_LENGTH);
    const name = () => (nameEl.node as HTMLInputElement).value.trim() || "Host";

    button(this, 960, 560, "Host online game", () => {
      saveName(name());
      this.scene.start("hostLobby", { name: name() });
    }, { size: 48, origin: 0.5 });
    button(this, 960, 680, "Join game", () => {
      saveName(name());
      this.scene.start("join");
    }, { size: 48, origin: 0.5 });
    button(this, 960, 800, "Single player", () => this.scene.start("start"), { size: 48, origin: 0.5 });
    this.resetButton(bar);
  }

  // Wiping the profile takes two clicks.
  private resetButton(bar: XpBar): void {
    const shown: Phaser.GameObjects.Text[] = [];
    const ask = () => {
      shown.forEach((t) => t.destroy());
      shown.length = 0;
      shown.push(label(this, 60, 940, "Erase all experience and unlocks?", 30));
      shown.push(button(this, 60, 1000, "Yes, reset", () => {
        resetProfile();
        bar.setExperience(0);
        shown.forEach((t) => t.destroy());
        shown.length = 0;
        shown.push(label(this, 60, 1000, "Progress reset.", 30, { color: "#9fd1b8" }));
      }));
      shown.push(button(this, 400, 1000, "Cancel", () => {
        shown.forEach((t) => t.destroy());
        shown.length = 0;
        shown.push(button(this, 60, 1000, "Reset progress", ask));
      }));
    };
    shown.push(button(this, 60, 1000, "Reset progress", ask));
  }
}
