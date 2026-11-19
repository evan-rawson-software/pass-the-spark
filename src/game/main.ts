import Phaser from "phaser";
import { CombatScene } from "./CombatScene";
import { EndScene } from "./EndScene";
import { hasDevParams } from "./devBattle";
import { StartScene } from "./StartScene";
import { MenuScene } from "./MenuScene";
import { HostLobbyScene } from "./HostLobbyScene";
import { JoinScene } from "./JoinScene";
import { DominoTestScene } from "./DominoTestScene";
import { TitleScene } from "./TitleScene";
import { debugPanel } from "./DebugPanel";

// The menu is the default; a link with ?room=CODE opens the join screen. Dev query params (see devBattle.ts) skip it and
// open the combat table directly. ?scene=dominoes opens the domino drawing test
// page and ?scene=title the title.
const query = new URLSearchParams(window.location.search);
const which = query.get("scene");
const first =
  which === "dominoes" ? DominoTestScene
  : which === "title" ? TitleScene
  : hasDevParams(query) ? CombatScene
  : query.has("room") ? JoinScene
  : MenuScene;
const scenes = [
  first,
  ...[MenuScene, StartScene, HostLobbyScene, JoinScene, CombatScene, EndScene, TitleScene, DominoTestScene].filter(
    (s) => s !== first,
  ),
];

debugPanel.install(); // backtick opens the debug panel (#28)

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
  dom: { createContainer: true },
  scene: scenes,
});
