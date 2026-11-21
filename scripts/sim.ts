// npm run sim [battlesPerEnemy] [seed] [--bot stock|planner|both] [--workers n]
// Plays random and bot battles against each enemy in data/ with 2, 3 and 4 players (enemy health and
// attack scale with party size). The bot is the stock bot, the planning bot, or (the default) both.
// Prints, per enemy, the players side by side, then how cascades went.
//
// Columns:
//   win      share of battles won
//   rounds   average rounds per battle
//   pass     share of player turns that were a pass
//   >1 opt   share of player turns with more than one distinct legal choice. A choice is a play
//            (one domino on one end; the opener has no end), or pass. Pass is always legal, so
//            this is the share of turns where something besides passing was possible.
//   >1 play  share of player turns with more than one distinct play (domino x end), the closer
//            comparison with the old "more than one option" figure (about 30% of answer decisions in #123)
//   opts     average distinct legal choices per player turn (plays + pass)
//   plays    average distinct plays (domino x end) per player turn
//   board    average dominoes on the board per cascade
//   junc     average junctions (branch points) per cascade
//   caps     average caps per cascade
//   fizz     average ends left uncapped (fizzled) per cascade
//   dmg      average damage reaching the enemy's health per cascade (after its block)
//
// After each table: the spread of damage per cascade (0 / 1-5 / 6-10 / 11+), damage caps against block
// caps that went off, and how cascades started (every end capped / everyone passed); then the spread
// of damage as a share of the enemy's health at the start of the fight.
// The same arguments give the same output.

import { enemies, playRandomBattle } from "./randomPlay";
import type { BattleStats, Player } from "./randomPlay";
import { inWorker, runJobs, serve } from "./parallel";
import { parseSimArgs } from "./simArgs";

const maxSteps = 100000;
const SHARE_LIMITS = [0.1, 0.25, 0.5, 0.75]; // cascade damage as a share of enemy health: under 10%, 10-25%, 25-50%, 50-75%, 75% and over
const SHARE_LABELS = ["<10%", "10-25%", "25-50%", "50-75%", "75%+"];

interface Job {
  enemy: string;
  partySize: number;
  player: Player;
  seed: number;
  count: number;
}

// The battles of a job. The final state stays behind: the parent has no use for it.
function work(job: Job): Omit<BattleStats, "final">[] {
  const out: Omit<BattleStats, "final">[] = [];
  for (let i = 0; i < job.count; i++) {
    const { final, ...stats } = playRandomBattle(job.enemy, job.seed + i, maxSteps, job.player, job.partySize);
    out.push(stats);
  }
  return out;
}

interface Totals {
  wins: number;
  rounds: number;
  turns: number;
  passes: number;
  withChoice: number;
  withPlays: number;
  choices: number;
  playOptions: number;
  cascades: number;
  nodes: number;
  junctions: number;
  caps: number;
  fizzled: number;
  damage: number;
  buckets: number[]; // cascades dealing 0, 1-5, 6-10, 11+ damage
  shares: number[]; // cascades dealing SHARE_LABELS of the enemy's health
  damageCaps: number;
  blockCaps: number;
  ended: Record<string, number>;
}
const empty = (): Totals => ({
  wins: 0, rounds: 0, turns: 0, passes: 0, withChoice: 0, withPlays: 0, choices: 0, playOptions: 0, cascades: 0, nodes: 0, junctions: 0, caps: 0, fizzled: 0, damage: 0,
  buckets: [0, 0, 0, 0], shares: [0, 0, 0, 0, 0], damageCaps: 0, blockCaps: 0, ended: { capped: 0, passes: 0 },
});

function add(t: Totals, r: Omit<BattleStats, "final">): void {
  if (r.result === "won") t.wins += 1;
  t.rounds += r.rounds;
  t.turns += r.turns;
  t.passes += r.passes;
  t.withChoice += r.turnsWithChoice;
  t.withPlays += r.turnsWithPlays;
  t.choices += r.choices;
  t.playOptions += r.playOptions;
  for (const c of r.cascades) {
    t.cascades += 1;
    t.nodes += c.nodes;
    t.junctions += c.junctions;
    t.caps += c.caps;
    t.fizzled += c.fizzled;
    t.damage += c.damage;
    t.buckets[c.damage === 0 ? 0 : c.damage <= 5 ? 1 : c.damage <= 10 ? 2 : 3] += 1;
    const share = c.damage / r.enemyHealth;
    t.shares[SHARE_LIMITS.filter((limit) => share >= limit).length] += 1;
    t.damageCaps += c.damageCaps;
    t.blockCaps += c.blockCaps;
    t.ended[c.ended] += 1;
  }
}

const pct = (n: number, d: number) => (d === 0 ? "-" : ((100 * n) / d).toFixed(1) + "%");
const num = (n: number, d: number, places = 2) => (d === 0 ? "-" : (n / d).toFixed(places));

function cells(t: Totals): string[] {
  return [
    pct(t.wins, battles), num(t.rounds, battles, 1), pct(t.passes, t.turns), pct(t.withChoice, t.turns), pct(t.withPlays, t.turns), num(t.choices, t.turns), num(t.playOptions, t.turns),
    num(t.nodes, t.cascades), num(t.junctions, t.cascades), num(t.caps, t.cascades), num(t.fizzled, t.cascades), num(t.damage, t.cascades, 1),
  ];
}

const header = ["win", "rounds", "pass", ">1 opt", ">1 play", "opts", "plays", "board", "junc", "caps", "fizz", "dmg"];
const widths = header.map((h) => Math.max(h.length, 7));
const row = (label: string, who: string, values: string[]) =>
  label.padEnd(24) + who.padEnd(8) + values.map((v, i) => v.padStart(widths[i] + 1)).join("");

let battles = 0; // battles per enemy, set in main (cells() divides by it)

async function main(): Promise<void> {
  const args = parseSimArgs();
  battles = Number(args.positional[0] ?? 200);
  const baseSeed = Number(args.positional[1] ?? 1);
  const players: Player[] = ["random", ...args.bots];

  type Per = Record<string, Totals>; // by player
  const fresh = (): Per => Object.fromEntries(players.map((p) => [p, empty()]));

  // Totals are over battles, so the win rate of a group divides by its battle count.
  const group = (label: string, t: Per, count: number): void => {
    players.forEach((player, i) => {
      const c = cells(t[player]);
      c[0] = pct(t[player].wins, count * battles);
      c[1] = num(t[player].rounds, count * battles, 1);
      console.log(row(i === 0 ? label : "", player, c));
    });
  };

  const behaviour = (label: string, t: Per): void => {
    players.forEach((player, i) => {
      const x = t[player];
      const b = x.buckets.map((n) => pct(n, x.cascades).padStart(6));
      const e = [x.ended.capped, x.ended.passes].map((n) => pct(n, x.cascades).padStart(6));
      console.log(
        (i === 0 ? label : "").padEnd(10) + player.padEnd(8) + b.join(" ") + " |" + String(x.damageCaps).padStart(8) + String(x.blockCaps).padStart(8) + " |" + e.join(" "),
      );
    });
  };

  const shares = (label: string, t: Per): void => {
    players.forEach((player, i) => {
      const x = t[player];
      console.log((i === 0 ? label : "").padEnd(10) + player.padEnd(8) + x.shares.map((n) => pct(n, x.cascades).padStart(8)).join(" "));
    });
  };

  const sizes = [2, 3, 4];
  const jobs: Job[] = [];
  for (const partySize of sizes) for (const enemy of enemies) for (const player of players) jobs.push({ enemy: enemy.id, partySize, player, seed: baseSeed, count: battles });
  const done = await runJobs(jobs, args.workers, work);

  console.log(`${battles} battles per enemy and party size, base seed ${baseSeed}`);
  console.log("opts/plays count distinct legal choices per player turn; see the column notes at the top of scripts/sim.ts.");
  console.log("'>1 opt' counts pass as a choice; '>1 play' counts only plays (domino x end). 'pass' is the share of turns that were a pass.");
  console.log("Board, junc, caps, fizz and dmg are per cascade, averaged over all cascades of the battles.");

  for (const partySize of sizes) {
    console.log("");
    console.log(`===== ${partySize} PLAYERS =====`);
    console.log("".padEnd(32) + header.map((h, i) => h.padStart(widths[i] + 1)).join(""));
    const byTier = new Map<string, Per>();
    const all = fresh();
    for (const enemy of enemies) {
      const tier = byTier.get(enemy.tier) ?? fresh();
      byTier.set(enemy.tier, tier);
      const per = fresh();
      for (const player of players) {
        done[jobs.findIndex((j) => j.partySize === partySize && j.enemy === enemy.id && j.player === player)].forEach((r) => {
          add(per[player], r);
          add(tier[player], r);
          add(all[player], r);
        });
      }
      players.forEach((player, i) => console.log(row(i === 0 ? `${enemy.id} (${enemy.tier})` : "", player, cells(per[player]))));
    }
    console.log("");
    console.log("BY TIER");
    for (const [tier, t] of byTier) group(tier, t, enemies.filter((e) => e.tier === tier).length);
    console.log("");
    console.log("ALL ENEMIES");
    group("all", all, enemies.length);

    console.log("");
    console.log(`HOW CASCADES WENT (${partySize} players): share of cascades by damage dealt | caps that went off | how the cascade started`);
    console.log(
      "".padEnd(18) + ["0", "1-5", "6-10", "11+"].map((h) => h.padStart(6)).join(" ") + " |" + "dmg caps".padStart(8) + "blk caps".padStart(8) + " |" + ["capped", "passes"].map((h) => h.padStart(6)).join(" "),
    );
    for (const [tier, t] of byTier) behaviour(tier, t);
    behaviour("all", all);

    console.log("");
    console.log(`CASCADES BY SHARE OF ENEMY HEALTH (${partySize} players): damage dealt as a share of the enemy's health at the start of the fight`);
    console.log("".padEnd(18) + SHARE_LABELS.map((h) => h.padStart(8)).join(" "));
    for (const [tier, t] of byTier) shares(tier, t);
    shares("all", all);
  }
}

if (inWorker) serve(work);
else await main();
