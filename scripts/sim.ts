// npm run sim [battlesPerEnemy] [seed]
// Plays random and bot battles against each enemy in data/ and prints averages side by side.
// "chain" is the number of answers per round, player and enemy (the opener is not counted).
// "player ans" counts only the players' answers per round.

import { enemies, playRandomBattle } from "./randomPlay";
import type { Player } from "./randomPlay";

declare const process: { argv: string[] }; // avoids adding @types/node
const battles = Number(process.argv[2] ?? 200);
const baseSeed = Number(process.argv[3] ?? 1);
const maxSteps = 100000;

function measure(enemyId: string, player: Player): string[] {
  let wins = 0;
  let rounds = 0;
  let chainSum = 0;
  let chainCount = 0;
  let playerSum = 0;
  for (let i = 0; i < battles; i++) {
    const r = playRandomBattle(enemyId, baseSeed + i, maxSteps, player);
    if (r.result === "won") wins += 1;
    rounds += r.rounds;
    for (const c of r.chains) chainSum += c;
    for (const c of r.playerAnswers) playerSum += c;
    chainCount += r.chains.length;
  }
  return [
    ((100 * wins) / battles).toFixed(1).padStart(6) + "%",
    (rounds / battles).toFixed(1).padStart(6),
    (chainSum / chainCount).toFixed(2).padStart(6),
    (playerSum / chainCount).toFixed(2).padStart(10),
  ];
}

console.log(`${battles} battles per enemy, base seed ${baseSeed}`);
console.log("                |            random                |             bot");
console.log("enemy            win rate  rounds   chain  player ans   win rate  rounds   chain  player ans");
for (const enemy of enemies) {
  const row = [enemy.id.padEnd(15), ...measure(enemy.id, "random"), "|", ...measure(enemy.id, "bot")];
  console.log(row.join("  "));
}
