import Phaser from "phaser";
import type { Client } from "../net/client";
import { REFUSED_BUILD } from "../net/protocol";
import { relay } from "./relay";
import { button, FONT } from "./ui";

// Client only: tells the player when the link to the host is lost, and offers the way out when the
// host is gone for good. The client reconnects by itself (see net/client.ts).
export function watchLink(scene: Phaser.Scene, client: Client | null | undefined): void {
  if (!client) return;
  const objects: Phaser.GameObjects.GameObject[] = [];
  const draw = () => {
    objects.forEach((o) => o.destroy());
    objects.length = 0;
    if (relay.link === "ok" && relay.refused === null) return;
    const text = (y: number, s: string, size: number) =>
      scene.add.text(960, y, s, { fontFamily: FONT, fontSize: `${size}px`, color: "#ffd0cc", fontStyle: "bold", backgroundColor: "#0d2a20", padding: { x: 24, y: 10 } }).setOrigin(0.5).setDepth(2000);
    if (relay.refused !== null) {
      // The host turned us away when we came back (for example, the page was updated meanwhile).
      objects.push(scene.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.6).setDepth(1999).setInteractive());
      objects.push(text(480, relay.refused, 44));
      const build = relay.refused === REFUSED_BUILD;
      objects.push(
        button(scene, 960, 640, build ? "Refresh" : "Back to start", () => {
          if (build) window.location.reload();
          else {
            client.close();
            scene.scene.start("menu");
          }
        }, { size: 44, origin: 0.5 }).setDepth(2000),
      );
    } else if (relay.link === "reconnecting") objects.push(text(24, "Connection lost. Reconnecting...", 28));
    else {
      objects.push(scene.add.rectangle(960, 540, 1920, 1080, 0x000000, 0.6).setDepth(1999).setInteractive());
      objects.push(text(480, "Host disconnected", 64));
      objects.push(
        button(scene, 960, 640, "Back to start", () => {
          client.close();
          scene.scene.start("menu");
        }, { size: 44, origin: 0.5 }).setDepth(2000),
      );
    }
  };
  relay.onLink = draw;
  scene.events.once("shutdown", () => {
    if (relay.onLink === draw) relay.onLink = null;
  });
  draw();
}
