// npm run sim:run [runs] [seed] [--bot stock|planner|both] [--workers n]
// Plays whole runs, `runs` for each of 2, 3 and 4 players (seeds seed .. seed+runs-1), and
// prints the run win rate, act clears, where runs die, party health entering each boss and the
// win rate by charm held. Battles are played by the stock bot, the planning bot, or (the default)
// both, side by side. Same arguments, same output; the time per run goes to stderr, since it is
// the one thing that differs between runs.

import { inWorker, runJobs, serve } from "./parallel";
import { parseSimArgs } from "./simArgs";
import type { BotKind } from "./simArgs";
import { content, playRun } from "./runPlay";
import type { RunStats } from "./runPlay";

declare const performance: { now(): number };

const maxSteps = 50000;
const acts = content.run.acts.length;
const CHUNK = 5; // runs per job

interface Job {
  bot: BotKind;
  players: number;
  seed: number;
  count: number;
}
interface Done {
  stats: RunStats[];
  ms: number; // time spent playing them
}

function work(job: Job): Done {
  const start = performance.now();
  const stats: RunStats[] = [];
  for (let i = 0; i < job.count; i++) stats.push(playRun(job.players, job.seed + i, maxSteps, job.bot));
  return { stats, ms: performance.now() - start };
}

const pct = (n: number, d: number) => (d === 0 ? "   -  " : ((100 * n) / d).toFixed(1).padStart(5) + "%");
const avg = (xs: number[]) => (xs.length === 0 ? "   - " : (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1).padStart(5));
const col = (s: string) => s.padStart(10);

// One column: a bot and a player count (or all of them).
interface Group {
  bot: BotKind;
  name: string;
  stats: RunStats[];
  ms: number;
}

async function main(): Promise<void> {
  const { positional, bots, workers } = parseSimArgs();
  const runs = Number(positional[0] ?? 500);
  const baseSeed = Number(positional[1] ?? 1);
  const sizes = [2, 3, 4];

  const jobs: Job[] = [];
  for (const bot of bots) for (const players of sizes) for (let i = 0; i < runs; i += CHUNK) jobs.push({ bot, players, seed: baseSeed + i, count: Math.min(CHUNK, runs - i) });
  const wallStart = performance.now();
  const done = await runJobs(jobs, workers, work);
  const wall = performance.now() - wallStart;

  const groups: Group[] = [];
  for (const bot of bots) {
    const own: Group[] = sizes.map((n) => ({ bot, name: `${n} players`, stats: [], ms: 0 }));
    jobs.forEach((job, i) => {
      if (job.bot !== bot) return;
      const g = own[sizes.indexOf(job.players)];
      g.stats.push(...done[i].stats);
      g.ms += done[i].ms;
    });
    groups.push(...own, { bot, name: "all", stats: own.flatMap((g) => g.stats), ms: own.reduce((s, g) => s + g.ms, 0) });
  }

  // With both bots, a column header has two lines: the player count, then the bot.
  const header = (title: string) => {
    if (title.length >= 30) console.log(title);
    console.log((title.length >= 30 ? "" : title).padEnd(30) + groups.map((g) => col(g.name)).join(""));
    if (bots.length > 1) console.log("".padEnd(30) + groups.map((g) => col(g.bot)).join(""));
  };

  console.log(`${runs} runs per player count, base seed ${baseSeed}, battles played by ${bots.join(" and ")}`);
  console.log("");
  header("RESULTS");
  console.log("run win rate".padEnd(30) + groups.map((g) => col(pct(g.stats.filter((s) => s.result === "won").length, g.stats.length))).join(""));
  for (let a = 1; a < acts; a++) {
    console.log(`clear act ${a}`.padEnd(30) + groups.map((g) => col(pct(g.stats.filter((s) => s.actsCleared >= a).length, g.stats.length))).join(""));
  }
  console.log("capped runs (step cap)".padEnd(30) + groups.map((g) => col(String(g.stats.filter((s) => s.capped).length))).join(""));
  console.log("average steps per run".padEnd(30) + groups.map((g) => col(avg(g.stats.map((s) => s.steps)))).join(""));

  console.log("");
  header("AVERAGE PARTY HEALTH ENTERING THE BOSS (runs that got there)");
  for (let a = 0; a < acts; a++) {
    const cells = groups.map((g) => {
      const hs = g.stats.map((s) => s.bossHealth[a]).filter((h): h is number => h !== null);
      return col(`${avg(hs)} (${hs.length})`);
    });
    console.log(`act ${a + 1} boss`.padEnd(30) + cells.join(""));
  }

  console.log("");
  header("LINE REACHED (share of battle cascades)");
  const stops = ["fight", "elite", "boss"];
  for (let a = 0; a < acts; a++) {
    for (let t = 0; t < 3; t++) {
      const cells = groups.map((g) => col(pct(g.stats.reduce((n, s) => n + s.lines[a * 3 + t], 0), g.stats.reduce((n, s) => n + s.cascades[a * 3 + t], 0))));
      console.log(`act ${a + 1} ${stops[t]}`.padEnd(30) + cells.join(""));
    }
  }

  console.log("");
  header("BOSSES: runs that fought it, and the share of those it beat");
  for (const act of content.run.acts) {
    for (const boss of act.bossPool) {
      const cells = groups.map((g) => {
        const faced = g.stats.filter((s) => s.bossesFaced.includes(boss));
        return col(`${faced.length} ${pct(faced.filter((s) => s.diedTo === boss).length, faced.length)}`);
      });
      console.log(boss.padEnd(30) + cells.join(""));
    }
  }

  for (const bot of bots) {
    const all = groups.find((g) => g.bot === bot && g.name === "all")!.stats;
    console.log("");
    if (bots.length > 1) console.log(`######## ${bot} bot ########`);
    console.log("WHERE RUNS DIE (share of all runs, all player counts; act / stop type)");
    const lost = all.filter((s) => s.result === "lost");
    const stops = ["fight", "elite", "boss", "event", "other"];
    console.log("act".padEnd(8) + stops.map((s) => col(s)).join("") + col("total"));
    for (let a = 0; a < acts; a++) {
      const inAct = lost.filter((s) => s.actIndex === a);
      const cells = stops.map((st) => inAct.filter((s) => (stops.includes(s.stop) ? s.stop : "other") === st).length);
      console.log(`act ${a + 1}`.padEnd(8) + cells.map((c) => col(pct(c, all.length))).join("") + col(pct(inAct.length, all.length)));
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
    for (const charm of content.charms) {
      const held = all.filter((s) => s.charmsHeld.includes(charm.id));
      const not = all.filter((s) => !s.charmsHeld.includes(charm.id));
      const wins = (xs: RunStats[]) => xs.filter((s) => s.result === "won").length;
      console.log(charm.id.padEnd(20) + col(String(held.length)) + col(pct(wins(held), held.length)) + col(String(not.length)) + col(pct(wins(not), not.length)));
    }
    const cappedRuns = all.filter((s) => s.capped);
    if (cappedRuns.length > 0) console.log(`\n${cappedRuns.length} run(s) hit the step cap of ${maxSteps}; they count as neither wins nor deaths.`);
  }

  // Timing is not part of the results: it differs from one machine and one run to the next.
  console.error(`\nTIME: seconds of play per run on one core; ${workers} worker(s), ${(wall / 1000).toFixed(0)}s wall for everything`);
  for (const g of groups) console.error(`${g.bot.padEnd(8)}${g.name.padEnd(12)}${(g.ms / 1000 / g.stats.length).toFixed(2).padStart(7)} s/run${(g.ms / 1000).toFixed(0).padStart(8)} s total`);
}

if (inWorker) serve(work);
else await main();
