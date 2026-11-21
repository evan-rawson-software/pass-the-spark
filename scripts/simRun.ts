// npm run sim:run [runs] [seed]
// Plays whole runs with the bot, `runs` for each of 2, 3 and 4 players (seeds seed .. seed+runs-1), and
// prints the run win rate, act clears, where runs die, party health entering each boss and the
// win rate by charm held. Same arguments, same output.

import { content, playRun } from "./runPlay";
import type { RunStats } from "./runPlay";

declare const process: { argv: string[] }; // avoids adding @types/node
const runs = Number(process.argv[2] ?? 500);
const baseSeed = Number(process.argv[3] ?? 1);
const maxSteps = 50000;
const acts = content.run.acts.length;

const groups: { name: string; stats: RunStats[] }[] = [
  { name: "2 players", stats: [] },
  { name: "3 players", stats: [] },
  { name: "4 players", stats: [] },
];
for (const g of groups) {
  const count = Number(g.name[0]);
  for (let i = 0; i < runs; i++) g.stats.push(playRun(count, baseSeed + i, maxSteps));
}
groups.push({ name: "all", stats: groups.flatMap((g) => g.stats) });

const pct = (n: number, d: number) => (d === 0 ? "   -  " : ((100 * n) / d).toFixed(1).padStart(5) + "%");
const avg = (xs: number[]) => (xs.length === 0 ? "   - " : (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1).padStart(5));
const col = (s: string) => s.padStart(10);

console.log(`${runs} runs per player count, base seed ${baseSeed}`);
console.log("");
console.log("RESULTS".padEnd(30) + groups.map((g) => col(g.name)).join(""));
console.log("run win rate".padEnd(30) + groups.map((g) => col(pct(g.stats.filter((s) => s.result === "won").length, g.stats.length))).join(""));
for (let a = 1; a < acts; a++) {
  console.log(`clear act ${a}`.padEnd(30) + groups.map((g) => col(pct(g.stats.filter((s) => s.actsCleared >= a).length, g.stats.length))).join(""));
}
console.log("capped runs (step cap)".padEnd(30) + groups.map((g) => col(String(g.stats.filter((s) => s.capped).length))).join(""));
console.log("average steps per run".padEnd(30) + groups.map((g) => col(avg(g.stats.map((s) => s.steps)))).join(""));

console.log("");
console.log("AVERAGE PARTY HEALTH ENTERING THE BOSS (runs that got there)");
for (let a = 0; a < acts; a++) {
  const cells = groups.map((g) => {
    const hs = g.stats.map((s) => s.bossHealth[a]).filter((h): h is number => h !== null);
    return col(`${avg(hs)} (${hs.length})`);
  });
  console.log(`act ${a + 1} boss`.padEnd(30) + cells.join(""));
}

console.log("");
console.log("WHERE RUNS DIE (share of all runs, all player counts; act / stop type)");
const lost = groups[3].stats.filter((s) => s.result === "lost");
const stops = ["fight", "elite", "boss", "event", "other"];
console.log("act".padEnd(8) + stops.map((s) => col(s)).join("") + col("total"));
for (let a = 0; a < acts; a++) {
  const inAct = lost.filter((s) => s.actIndex === a);
  const cells = stops.map((st) => inAct.filter((s) => (stops.includes(s.stop) ? s.stop : "other") === st).length);
  console.log(`act ${a + 1}`.padEnd(8) + cells.map((c) => col(pct(c, groups[3].stats.length))).join("") + col(pct(inAct.length, groups[3].stats.length)));
}
console.log("");
console.log("deaths by act and floor (count of runs; boss is the floor after the last)");
for (let a = 0; a < acts; a++) {
  const byFloor = new Map<number, Map<string, number>>();
  for (const s of lost.filter((x) => x.actIndex === a)) {
    const f = byFloor.get(s.floor) ?? new Map<string, number>();
    f.set(s.stop, (f.get(s.stop) ?? 0) + 1);
    byFloor.set(s.floor, f);
  }
  const parts = [...byFloor.keys()].sort((x, y) => x - y).map((fl) => `${fl}: ` + [...byFloor.get(fl)!].map(([st, n]) => `${st} ${n}`).join(", "));
  console.log(`act ${a + 1}  ` + (parts.length === 0 ? "none" : parts.join(" | ")));
}

console.log("");
console.log("WIN RATE BY CHARM (all player counts; held = any player held it at some point)");
console.log("charm".padEnd(20) + col("runs held") + col("win held") + col("runs not") + col("win not"));
const all = groups[3].stats;
for (const charm of content.charms) {
  const held = all.filter((s) => s.charmsHeld.includes(charm.id));
  const not = all.filter((s) => !s.charmsHeld.includes(charm.id));
  const wins = (xs: RunStats[]) => xs.filter((s) => s.result === "won").length;
  console.log(charm.id.padEnd(20) + col(String(held.length)) + col(pct(wins(held), held.length)) + col(String(not.length)) + col(pct(wins(not), not.length)));
}
const cappedRuns = all.filter((s) => s.capped);
if (cappedRuns.length > 0) console.log(`\n${cappedRuns.length} run(s) hit the step cap of ${maxSteps}; they count as neither wins nor deaths.`);
