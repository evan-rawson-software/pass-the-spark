// npm run sim [battlesPerEnemy] [seed]
// Plays random and bot battles against each enemy in data/ with 2, 3 and 4 players (enemy health and
// attack scale with party size). Prints, per enemy, random and bot side by
// side, then how cascades went.
//
// Columns:
//   win      share of battles won
//   rounds   average rounds per battle
//   >1 opt   share of player turns with more than one distinct legal choice. A choice is a play
//            (one domino on one end; the opener has no end), pass, or set off. Pass is always legal, so
//            this is the share of turns where something besides passing was possible.
//   >1 play  share of player turns with more than one distinct play (domino x end), the closer
//            comparison with the old "more than one option" figure (about 30% of answer decisions in #123)
//   opts     average distinct legal choices per player turn (plays + pass + set off)
//   plays    average distinct plays (domino x end) per player turn
//   board    average dominoes on the board per cascade
//   junc     average junctions (branch points) per cascade
//   caps     average caps per cascade
//   fizz     average ends left uncapped (fizzled) per cascade
//   dmg      average damage reaching the enemy's health per cascade (after its block)
//
// After each table: the spread of damage per cascade (0 / 1-5 / 6-10 / 11+), damage caps against block
// caps that went off, and how cascades started (every end capped / a player set off / everyone passed).

import { enemies, playRandomBattle } from "./randomPlay";
import type { BattleStats, Player } from "./randomPlay";

declare const process: { argv: string[] }; // avoids adding @types/node
const battles = Number(process.argv[2] ?? 200);
const baseSeed = Number(process.argv[3] ?? 1);
const maxSteps = 100000;

interface Totals {
  wins: number;
  rounds: number;
  turns: number;
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
  damageCaps: number;
  blockCaps: number;
  ended: Record<string, number>;
}
const empty = (): Totals => ({
  wins: 0, rounds: 0, turns: 0, withChoice: 0, withPlays: 0, choices: 0, playOptions: 0, cascades: 0, nodes: 0, junctions: 0, caps: 0, fizzled: 0, damage: 0,
  buckets: [0, 0, 0, 0], damageCaps: 0, blockCaps: 0, ended: { capped: 0, player: 0, passes: 0 },
});

function add(t: Totals, r: BattleStats): void {
  if (r.result === "won") t.wins += 1;
  t.rounds += r.rounds;
  t.turns += r.turns;
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
    t.damageCaps += c.damageCaps;
    t.blockCaps += c.blockCaps;
    t.ended[c.ended] += 1;
  }
}

const pct = (n: number, d: number) => (d === 0 ? "-" : ((100 * n) / d).toFixed(1) + "%");
const num = (n: number, d: number, places = 2) => (d === 0 ? "-" : (n / d).toFixed(places));

function cells(t: Totals): string[] {
  return [
    pct(t.wins, battles), num(t.rounds, battles, 1), pct(t.withChoice, t.turns), pct(t.withPlays, t.turns), num(t.choices, t.turns), num(t.playOptions, t.turns),
    num(t.nodes, t.cascades), num(t.junctions, t.cascades), num(t.caps, t.cascades), num(t.fizzled, t.cascades), num(t.damage, t.cascades, 1),
  ];
}

const header = ["win", "rounds", ">1 opt", ">1 play", "opts", "plays", "board", "junc", "caps", "fizz", "dmg"];
const widths = header.map((h) => Math.max(h.length, 7));
const row = (label: string, who: string, values: string[]) =>
  label.padEnd(24) + who.padEnd(7) + values.map((v, i) => v.padStart(widths[i] + 1)).join("");
const players: Player[] = ["random", "bot"];

// Totals are over battles, so the win rate of a group divides by its battle count.
function group(label: string, t: Record<Player, Totals>, count: number): void {
  for (const player of players) {
    const c = cells(t[player]);
    c[0] = pct(t[player].wins, count * battles);
    c[1] = num(t[player].rounds, count * battles, 1);
    console.log(row(player === "random" ? label : "", player, c));
  }
}

function behaviour(label: string, t: Record<Player, Totals>): void {
  for (const player of players) {
    const x = t[player];
    const b = x.buckets.map((n) => pct(n, x.cascades).padStart(6));
    const e = [x.ended.capped, x.ended.player, x.ended.passes].map((n) => pct(n, x.cascades).padStart(6));
    console.log(
      (player === "random" ? label : "").padEnd(10) + player.padEnd(8) + b.join(" ") + " |" + String(x.damageCaps).padStart(8) + String(x.blockCaps).padStart(8) + " |" + e.join(" "),
    );
  }
}

console.log(`${battles} battles per enemy and party size, base seed ${baseSeed}`);
console.log("opts/plays count distinct legal choices per player turn; see the column notes at the top of scripts/sim.ts.");
console.log("'>1 opt' counts pass and set off as choices; '>1 play' counts only plays (domino x end).");
console.log("Board, junc, caps, fizz and dmg are per cascade, averaged over all cascades of the battles.");

for (const partySize of [2, 3, 4]) {
  console.log("");
  console.log(`===== ${partySize} PLAYERS =====`);
  console.log("".padEnd(31) + header.map((h, i) => h.padStart(widths[i] + 1)).join(""));
  const byTier = new Map<string, Record<Player, Totals>>();
  const all: Record<Player, Totals> = { random: empty(), bot: empty() };
  for (const enemy of enemies) {
    const tier = byTier.get(enemy.tier) ?? { random: empty(), bot: empty() };
    byTier.set(enemy.tier, tier);
    const per: Record<Player, Totals> = { random: empty(), bot: empty() };
    for (const player of players) {
      for (let i = 0; i < battles; i++) {
        const r = playRandomBattle(enemy.id, baseSeed + i, maxSteps, player, partySize);
        add(per[player], r);
        add(tier[player], r);
        add(all[player], r);
      }
    }
    console.log(row(`${enemy.id} (${enemy.tier})`, "random", cells(per.random)));
    console.log(row("", "bot", cells(per.bot)));
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
    "".padEnd(18) + ["0", "1-5", "6-10", "11+"].map((h) => h.padStart(6)).join(" ") + " |" + "dmg caps".padStart(8) + "blk caps".padStart(8) + " |" + ["capped", "set off", "passes"].map((h) => h.padStart(6)).join(" "),
  );
  for (const [tier, t] of byTier) behaviour(tier, t);
  behaviour("all", all);
}
