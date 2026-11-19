import Phaser from "phaser";
import { CombatScene } from "./CombatScene";
import { DominoTestScene } from "./DominoTestScene";
import { TitleScene } from "./TitleScene";

// The combat table is the default. ?scene=dominoes opens the domino drawing test
// page and ?scene=title the title. The start screen (#27) will replace this choice.
const which = new URLSearchParams(window.location.search).get("scene");
const scenes =
  which === "dominoes" ? [DominoTestScene, TitleScene, CombatScene]
  : which === "title" ? [TitleScene, DominoTestScene, CombatScene]
  : [CombatScene, TitleScene, DominoTestScene];

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
  scene: scenes,
});
