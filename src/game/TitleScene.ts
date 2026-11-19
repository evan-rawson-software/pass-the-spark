import Phaser from "phaser";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  create(): void {
    this.add
      .text(960, 540, "Pass the Spark", { fontSize: "96px", color: "#ffffff" })
      .setOrigin(0.5);
  }
}
