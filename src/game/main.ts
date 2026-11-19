import Phaser from "phaser";
import { CombatScene } from "./CombatScene";
import { EndScene } from "./EndScene";
import { hasDevParams } from "./devBattle";
import { BUILD_ID } from "../net/buildId";
import { loadHostedRoom } from "../net/room";
import { StartScene } from "./StartScene";
import { MapScene } from "./MapScene";
import { RewardScene } from "./RewardScene";
import { RestScene } from "./RestScene";
import { TraderScene } from "./TraderScene";
import { EventScene } from "./EventScene";
import { RunEndScene } from "./RunEndScene";
import { MenuScene } from "./MenuScene";
import { HostLobbyScene } from "./HostLobbyScene";
import { JoinScene } from "./JoinScene";
import { DominoTestScene } from "./DominoTestScene";
import { TitleScene } from "./TitleScene";
import { DeckScene } from "./deckViewer";
import { debugPanel } from "./DebugPanel";

// The menu is the default; a link with ?room=CODE opens the join screen, or, in the browser that
// hosts that room, resumes it as host (#35; an unreadable save is dropped there and the page joins instead). Dev query params (see devBattle.ts) skip it and
// open the combat table directly. ?scene=dominoes opens the domino drawing test
// page and ?scene=title the title.
const query = new URLSearchParams(window.location.search);
const which = query.get("scene");
const first =
  which === "dominoes" ? DominoTestScene
  : which === "title" ? TitleScene
  : hasDevParams(query) ? CombatScene
  : query.has("room") ? (isMyRoom(query.get("room")!) ? HostLobbyScene : JoinScene)
  : MenuScene;
function isMyRoom(code: string): boolean {
  try {
    return loadHostedRoom(code.toUpperCase(), BUILD_ID, window.localStorage) !== null;
  } catch {
    return false;
  }
}
const scenes = [
  first,
  ...[MenuScene, StartScene, HostLobbyScene, JoinScene, CombatScene, EndScene, MapScene, RewardScene, RestScene, TraderScene, EventScene, RunEndScene, DeckScene, TitleScene, DominoTestScene].filter(
    (s) => s !== first,
  ),
];

debugPanel.install(); // backtick opens the debug panel (#28)

// A page restored from the back/forward cache has lost its connections: reload so it reconnects normally.
window.addEventListener("pageshow", (e) => {
  if (e.persisted) window.location.reload();
});

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
