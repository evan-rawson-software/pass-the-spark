// npm run sim [battlesPerEnemy] [seed]
// Plays random battles against each enemy in data/ and prints averages.
// "chain" is the number of answers per round, player and enemy (the opener is not counted).
// "player answers" counts only the players' answers per round.

import { enemies, playRandomBattle } from "./randomPlay";

declare const process: { argv: string[] }; // avoids adding @types/node
const battles = Number(process.argv[2] ?? 200);
const baseSeed = Number(process.argv[3] ?? 1);
const maxSteps = 100000;

console.log(`${battles} battles per enemy, base seed ${baseSeed}`);
console.log("enemy        win rate  rounds/battle  chain length  player answers");
for (const enemy of enemies) {
  let wins = 0;
  let rounds = 0;
  let chainSum = 0;
  let chainCount = 0;
  let playerSum = 0;
  for (let i = 0; i < battles; i++) {
    const r = playRandomBattle(enemy.id, baseSeed + i, maxSteps);
    if (r.result === "won") wins += 1;
    rounds += r.rounds;
    for (const c of r.chains) chainSum += c;
    for (const c of r.playerAnswers) playerSum += c;
    chainCount += r.chains.length;
  }
  const row = [
    enemy.id.padEnd(12),
    ((100 * wins) / battles).toFixed(1).padStart(7) + "%",
    (rounds / battles).toFixed(1).padStart(14),
    (chainSum / chainCount).toFixed(2).padStart(13),
    (playerSum / chainCount).toFixed(2).padStart(14),
  ];
  console.log(row.join("  "));
}
