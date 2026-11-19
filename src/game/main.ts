import Phaser from "phaser";
import { TitleScene } from "./TitleScene";

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
  scene: [TitleScene],
});
