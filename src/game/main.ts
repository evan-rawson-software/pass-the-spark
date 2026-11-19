import Phaser from "phaser";
import { DominoTestScene } from "./DominoTestScene";
import { TitleScene } from "./TitleScene";

// ?scene=dominoes opens the domino drawing test page instead of the title.
const showDominoes = new URLSearchParams(window.location.search).get("scene") === "dominoes";

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1920,
  height: 1080,
  backgroundColor: "#1e4d3a",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: showDominoes ? [DominoTestScene, TitleScene] : [TitleScene, DominoTestScene],
});
