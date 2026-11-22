# Pass the Spark 0.2: design

> **Status (2026-11-21):** approved. This is the source for 0.2's combat rules. Where it differs from the 0.1 docs (`docs/design-branching-cascade.md`, `docs/pass-the-spark-build-brief.md`, `docs/decisions.md`), this document wins. 0.2 rulings are in `docs/v0.2/decisions.md`. Exact numbers live in data.
>
> The proposals page with worked rounds you can play: https://claude.ai/artifact/WPedf7Zu2EQucRJGiFbnWY

0.2 keeps 0.1's core: a party builds one branching tree of dominoes, then it goes off as a cascade. It changes three things:

1. **The round (M14):** everyone builds at the same time on a budget of placements, and the cascade fires when everyone is ready. No seat order and no passing.
2. **The cascade (M14):** every domino hits as it lights, the damage total stays hidden until it fires, and each enemy has a line to beat. Beating it staggers the enemy.
3. **Content that changes the rules (M15, later):** enemy traits that change the board, a trait per spark, and a school per wizard. Outlined at the end; specified after the M14 playtest.

Everything not about how a battle plays stays as in 0.1: the run, map, events, rewards, coins, the Trader, rest sites, upgrades, progression, online rooms and single player.

## A round

1. **Round start.** The enemy shows its intent and its line. Everyone draws up to their hand size.
2. **The build.** Everyone places dominoes from their own hand at the same time, up to their placements for the round, talking freely. Anyone can take back their own domino while nothing hangs from it.
3. **Ready.** Each player presses Ready when they are happy. When every player is Ready, the cascade fires.
4. **The cascade.** Every domino lights in order and hits. Caps add their effect.
5. **The enemy acts.** It carries out its intent, halved if the cascade beat its line.
6. **Round end.** Party block resets, the board goes to its owners' discard piles, and the next round starts.

There is no lead, no seat order and no pass.

## The build

### Placements
- The party has **12 placements a round** (data), split evenly: **6 each with 2 players, 4 each with 3, 3 each with 4.** Each player's share is the party total divided by the party size, rounded down.
- Placing a domino uses one of your placements. You can only place from your own hand.
- Unused placements are lost at round end. Unplaced dominoes stay in your hand.

### Placing
- The first domino placed is the **opener**: any amplifier or junction, from anyone. Its intake is ignored. Charge starts at 1 and the opener applies to it, as in 0.1.
- After that, a domino goes on any **open end** whose spark matches its intake, as in 0.1.
- The **open-end limit** (4, data) still applies: a junction can't be placed if it would take the board over it.
- Placing a cap on the last open end no longer fires the cascade. Only Ready does.

### Taking back
- You can take back **your own** domino from the board when nothing is attached to any of its outputs. It returns to your hand and you get the placement back.
- The opener can be taken back the same way, when nothing hangs from it.
- You can't take back a teammate's domino.

### Ready and firing
- Each player has a Ready toggle. While you are Ready you can't place or take back; press it again to stop being Ready.
- Teammates placing or taking back doesn't change your Ready.
- **When every player is Ready, the cascade fires.** An empty board can fire: nothing goes off, and the enemy acts.
- An away player (online, dropped) holds up the table for the existing 60-second delay, with "Waiting for [name]" on their seat tab. After that they count as Ready, and the host can place, take back and toggle Ready for them until they return, as with turns in 0.1.

### Hands and drawing
- **Hand size = your placements + 2** (the extra is data). At the start of every round, including round 1, each player draws until their hand is at their hand size.
- An empty deck is reshuffled from the discard pile, as in 0.1.
- There is no separate first draw and no hand limit beyond the hand size.

## The board and charge

Unchanged from 0.1 (`docs/design-branching-cascade.md`, "The board and charge"): amplifiers change the charge (+N, ×N, Echo, Spectrum), junctions split it into two branches at full charge, caps close a branch, and charge is the product of the path. Charms that change charge (Keystone, Overcharge, Spark Starter, Resonance, Prism) and the Spark Shrine blessing work as in 0.1.

## The cascade

- It spreads outward from the opener step by step, as in 0.1: everything one step out lights together, branches fire at the same time.
- **Every domino hits when it lights:**
  - an **amplifier** or **junction** hits for the charge it passes on (its outgoing charge, after its own change and any charm or blessing);
  - a **cap** hits for base × the charge reaching it (plus flat bonuses), as many times as its triggers, as in 0.1. Block caps give block instead of hitting.
- Echo still adds triggers to caps only.
- Enemy block absorbs hits in the order they land. Ignores-block caps go through it.
- Uncapped ends fizzle as before. The dominoes on their path have already hit; only the cap's hit is lost.
- If the enemy reaches 0 health, the cascade stops and the battle is won, as before.

### The combo total and the line
- The **combo total** is the sum of every hit value in the cascade, before enemy block. It is the number the combo counter shows.
- Each enemy has a **line** (data, one number per enemy), shown with its intent from round start.
- When the combo total reaches the line, the enemy is **staggered** for this round: each attack hit of its intent deals half, rounded down. Growth (Smolder, Long Night) and the party-size attack percent apply first; the halving is last.
- Block intents are not halved.

### Hidden total
- During the build the screen shows every domino's own number (the charge an amplifier or junction passes on; a cap's value) and the enemy's line. It does **not** show the damage total.
- The block the party would gain is still shown, so the table can plan its defence.
- This is one presentation setting in data. The engine still offers the same previews; only the screen hides the sum.

## The enemy

- Intents and patterns as in 0.1, plus the line.
- Party-size tables: `enemyHealthPercentByPartySize` and `enemyAttackPercentByPartySize` stay in data but start at 100 for every size. The budget keeps the tree the same size at every party size; the tables are a tuning knob only if the sims show a gap.
- Boss passives keep their 0.1 wording (`docs/design-branching-cascade.md`, "Bosses and elites"). The Auditor still counts caps only. The Hoarder's block per domino will be re-tuned, since boards are now about 12 dominoes.

## Charms in M14

M15 reworks charms. Until then they keep their 0.1 wording, except:
- **Early Riser:** your hand size is +1.
- **Deep Pockets:** your hand size is +2.
- Neither adds placements.

## The starter deck

Every player starts with the same 13 dominoes. Every basic spark can carry damage, and the three basic sparks form a loop (Ember to Tide to Gale to Ember).

| Domino | Kind | Intake | Output | Value |
| --- | --- | --- | --- | --- |
| Ember Boost | amplifier | Ember | Ember | +1 |
| Ember-Tide Boost | amplifier | Ember | Tide | +1 |
| Tide Boost | amplifier | Tide | Tide | +1 |
| Tide-Gale Boost | amplifier | Tide | Gale | +1 |
| Gale-Ember Boost | amplifier | Gale | Ember | +1 |
| Ember Junction | junction | Ember | Tide, Gale | |
| Tide Junction | junction | Tide | Gale, Ember | |
| Gale Junction | junction | Gale | Ember, Tide | |
| Ember Strike | cap, damage | Ember | | 8 |
| Tide Strike | cap, damage | Tide | | 7 |
| Gale Strike | cap, damage | Gale | | 7 |
| Tide Guard | cap, block | Tide | | 5 |
| Gale Guard | cap, block | Gale | | 5 |

## Worked example

4 players, 3 placements each. The Ogre (340 health) intends to attack for 20; its line is 120. All numbers here are placeholders.

The build, at the same time:
- Ana opens with a Gale-Ember Boost (its intake is ignored; charge 2, Ember out). Ben adds Ember-Tide (3), Cy adds Tide-Gale (4), Dee adds a Gale Junction, splitting into Ember and Tide at 4.
- Ana puts an Ember Boost on the Ember branch (5) while Ben puts a Tide Boost on the Tide branch (5). Cy adds an Ember Junction on Ana's branch (Tide, Gale at 5); Dee adds a Tide Junction on Ben's (Gale, Ember at 5).
- Ben caps Tide with a Strike (7 × 5 = 35), Dee caps Gale with a Strike (35), Cy caps the other Gale with a Guard (25 block), Ana caps Ember with an Ember Strike (8 × 5 = 40).
- Each player still holds 2 dominoes. Everyone presses Ready.

The cascade hits 2, 3, 4, 4, 5, 5, 5, 5, then 35, 35, 40. The combo total runs 2 · 5 · 9 · 13 · 18 · 23 · 28 · 33 · 68 · 103 · 143, and crosses the line of 120 on the last cap. The Ogre is staggered: its 20 becomes 10, and the party's 25 block absorbs it. The Ogre goes from 340 to 197.

## Online and single player

- **Online:** any player can send a choice at any time during the build. The host applies choices in the order it receives them. A choice that is no longer legal when it arrives (the end was just taken, the budget is spent, the domino moved) is refused, and only that player is told; nothing else changes. Same seed and same ordered choices, same result.
- **Single player:** one person places from any seat's hand, within each seat's placements, and one Fire button makes every seat Ready.

## Later: content that changes the rules (M15)

Specified after the M14 playtest. The direction, from the proposals page:
- **One trait per enemy that changes the board,** such as Low Ceiling (only the first N steps fire), Narrow Pass (fewer open ends), Swarm (several bodies; each hit lands on the front one), Lock (one spark can't be attached to), Big Hit (a telegraphed attack), Rot (the enemy plants a domino you must build through).
- **One trait per spark,** applied to whatever is attached to it (the Spark Shrine's rule, always on). Ember: +1 charge. Tide: block as it lights. Gale: your first domino on a Gale end each round is free. Storm and Void get their own.
- **A school per wizard:** a starter deck that leans to one spark, plus a signature domino. Robe, hat and colour stay cosmetic.
- **Rewards that bend rules:** charms keyed to sparks and teammates, ×1.5 and ×2 amplifiers as uncommons, and enemy health that grows about 1.1 times from act 1 to act 2 and about 2 times from act 2 to act 3, as tuned in #274 (bosses less: about 1.0 and 1.3 times).
