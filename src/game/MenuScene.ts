import Phaser from "phaser";
import { MAX_NAME_LENGTH } from "../net/host";
import { debugPanel } from "./DebugPanel";
import { loadProfile } from "./profile";
import { drawXpBar } from "./xpBar";
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
    drawBackground(this, "title");
    label(this, 960, 110, "Pass the Spark", 96, { bold: true, origin: 0.5 });

    drawXpBar(this, 960, 215, 700, loadProfile().experience);

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
  }
}
