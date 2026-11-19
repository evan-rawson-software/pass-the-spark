import type { Enemy } from "../engine/types";
import type { TipLine } from "./tooltip";

// How a boss and its passives read on the map and the act screen. Names and numbers come from the enemy's data.

export function passiveText(boss: Enemy | undefined): string {
  const texts = (boss?.passives ?? []).map((p) => p.text ?? p.name).join(" ");
  return texts ? `Passive: ${texts}` : "No passive";
}

export function bossTip(boss: Enemy | undefined): TipLine[] {
  if (!boss) return [];
  const lines: TipLine[] = [
    { text: boss.name, style: "title" },
    { text: `Health ${boss.maxHealth}`, style: "dim" },
  ];
  if (boss.passives.length === 0) lines.push({ text: "No passive" });
  for (const p of boss.passives) {
    lines.push({ text: p.name, style: "head" });
    if (p.text) lines.push({ text: p.text });
  }
  return lines;
}
