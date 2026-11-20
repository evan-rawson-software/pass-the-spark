# Design: branching cascade chains

> **Approved 2026-11-20.** This document is the source for combat rules. Where it conflicts with earlier combat rulings in `docs/decisions.md` or the brief, this document wins. Exact numbers live in data.

This replaces the core combat rules. The party builds a branching chain of dominoes together, and nothing happens until it's finished. Then the whole chain goes off at once in one big, flashy cascade. The enemy no longer plays dominoes: it shows its next move (its intent), Slay the Spire style.

Designer direction so far (2026-11-20):
- The chain builds first and resolves all at once when it's done, in a cascading, flashy sequence.
- The chain branches: some dominoes are played sideways to start new branches.
- There are three kinds of domino: **junctions** (make branches), **amplifiers** (build up the chain) and **effect dominoes** that cap the end of a branch. Most dominoes have no effect of their own; the effects are on the caps.
- Enemies don't play dominoes. They have intents: "deal X damage", "gain X block", and so on.

This reverses three items from the brief's "decided against" list: finishers (caps are finishers), an End Chain option (see "A turn"), and enemy intents outside dominoes. These reversals are deliberate.

## A round

1. **The enemy shows its intent** for this round, for example "Attack 12" or "Block 10 and attack 6".
2. **Everyone draws** (5 in round 1, then 3; hand limit 10, as now).
3. **The party builds the chain.** Starting with the lead and going round in seat order, players take turns until the chain is set off.
4. **The cascade:** the chain goes off, and the party's effects happen.
5. **The enemy acts:** it carries out its intent.
6. **Round end:** party block resets, the lead moves on one seat, and the next round starts.

There is no enemy seat in the turn order any more, and there are no laps.

## Dominoes

Every domino still has an intake (the spark it attaches to) and the right side sets what it does. Sparks keep their colours, shapes and rarity pools.

| Kind | Intake | Outputs | What it does |
| --- | --- | --- | --- |
| **Amplifier** | 1 spark (or 2 after an upgrade, or "any") | 1 spark | Changes the **charge** flowing through it, for example +1, +2 or ×2. |
| **Junction** | 1 spark | 2 sparks | Splits the path. Both new branches carry the full charge so far. |
| **Cap** (effect) | 1 spark | none | Closes its end. When the charge reaches it, its effect goes off at base × charge. |

- **Cap effects:** damage, block, coins, and more later. Damage caps can have the ignores-block trait.
- **Amplifier variants** (a starting set, numbers in data):
  - Boost: +1 charge (common), +2 (uncommon);
  - Double: ×2 charge (rare);
  - Echo: every cap further along this path goes off twice;
  - Spectrum: + the number of different sparks on the path so far.
- **Junction variants:** a plain split to start with. **Decided (J1):** no branch types in the first version. Junctions that give their branches a type (such as Fire, damage ×1.5, or Ward, caps also give block) may come later as content, after the plain tree has been playtested.

## The board and charge

- The **opener** starts the chain and must be an amplifier or a junction. Its intake is ignored. Charge starts at 1 and the opener applies to it.
- An **open end** is any output spark that nothing is attached to yet.
- Each path from the opener to a cap carries a **charge**, the product of the amplifiers along it. A junction passes its current charge into both branches.
- **A cap's value** = its base × the charge reaching it, plus flat bonuses (charms, upgrades).
- **Open-end limit:** at most 4 open ends at once (data). A junction can't be played if it would go over the limit.

## A turn

On your turn you do one of:
- **Play** a domino from your hand onto any open end whose spark matches its intake, or as the opener if there's no chain yet.
- **Pass,** and play nothing this time around.
- **Set it off:** the chain goes off now. Not allowed before the first cap is placed.

The chain also goes off by itself when:
- every end is capped; or
- every player passes in a row (one full round of passes).

**Decided (T1):** passing is allowed even when you have a legal play. Holding a key cap for a better end is a real decision, and passing costs your turn.

## The cascade

- The charge flows outward from the opener, one step at a time. Everything one step out lights up together, then two steps out, and so on. Branches fire at the same time, like fire spreading through a tree.
- Amplifiers flare as the charge passes through them, junctions split the glow, and caps go off with their value.
- **Ends with no cap fizzle.** Their charge is wasted, so capping your branches is the goal.
- If the enemy reaches 0 health, the cascade stops and the battle is won.
- Block from caps is gained during the cascade and protects the party from the enemy's attack that follows.

## The enemy

- **Intents:** each enemy has a set of intents in data: attack X (possibly several hits), gain X block, attack and block together, and a few special ones for elites and bosses. Its next intent shows from round start.
- **Choosing the next intent:** each enemy has a pattern in data, either a fixed cycle or weighted random with no more than 2 of the same in a row. Both are supported; most enemies use a short cycle so players can learn them.
- **Block:** enemy block gained from an intent absorbs the party's damage in the next cascade, then resets after that cascade.
- **Health, tiers, coins and rewards** stay as they are. Enemy hands, decks, reactions, leftovers, Reflect and reveals are removed.
- Boss passives are listed under "Mapping".

## Hidden information

Nothing is hidden any more: intents are shown and hands are open. The brief's worry that one player could "call every play" grows. **Decided (H1):** teammates' hands stay open for the first playtest; judge then. Building together out loud is part of the fun, and hiding hands makes the tree hard to plan.

## Worked example

3 players. The enemy intends "Attack 12". The lead, Ana, starts.

1. Ana plays **Boost +1** (Ember out) as the opener. Charge 1 + 1 = 2. Open end: Ember.
2. Ben plays a **junction** (Ember in, Tide and Gale out). Both branches carry charge 2. Open ends: Tide, Gale.
3. Cy plays **Double ×2** on Tide (Ember out). That branch is now at charge 4. Open ends: Ember, Gale.
4. Ana plays **Guard** (block 3) on Gale and caps it. Open end: Ember.
5. Ben plays **Strike** (damage 4) on Ember and caps it. Every end is capped, so the chain goes off.

The cascade:
- step 1: the Boost flares;
- step 2: the junction splits the glow;
- step 3: the Double flares on the Tide branch, and Guard goes off on the Gale branch: 3 × 2 = **6 block**;
- step 4: Strike goes off: 4 × 4 = **16 damage**.

Then the enemy attacks for 12. Block absorbs 6, and the party takes 6.

## Mapping the existing game

Approved (M1).

### Effects and traits
- Damage and block become caps. Coins is a new cap: the coins go to the player who played it.
- Amplify becomes the Boost amplifier (+N).
- Echo becomes an amplifier: every cap further along its path goes off one extra time. Several Echoes on a path add up. The trigger cap (100) still applies.
- Spectrum becomes an amplifier: + the number of different intake sparks on the path from the opener up to and including it.
- Ignores block stays, as a trait on damage caps.
- **Dropped:** Lookout (nothing is hidden), Mimic (may return later as a cap that copies the nearest other cap), Heal and Reflect (enemy-only).

### Charms
"Your" means dominoes you played.

| Charm | New wording |
| --- | --- |
| Ember, Tide, Gale Lens | +2 to your caps set off by that spark (their intake spark). |
| Bulwark | +2 to your block caps. |
| Deep Pockets, Early Riser, Coin Purse, Haggler | Unchanged. |
| Resonance | Your Echo amplifiers add 1 more repeat. |
| Prism | Your Spectrum amplifiers count 1 extra spark. |
| Lightning Rod (rare) | Your caps set off by Storm or Void go off twice. |
| Keystone (rare) | Your amplifiers add +1 more charge, after their own change. |
| First Echo (rare) | Your first cap to go off each round goes off twice. |
| Spark Starter | Your opener adds +1 charge. |
| Spyglass | You see the enemy's intents 2 rounds ahead (only in your own view). |
| Junction Runner (was Lap Runner) | When your junction lights up in the cascade, the party gains 3 block. |
| Overcharge (rare) | Your Double amplifiers multiply by 3 instead of 2. |
| Hall of Mirrors (rare) | Your junctions open 3 ends instead of 2; the third end repeats the junction's first output spark. It counts toward the open-end limit, so it can't be played if the limit would be exceeded. |

### Bosses and elites
- Every enemy gets intents in place of its deck (placeholder intents by the coders, as with the M4 content). Elites have no special dominoes any more; they have stronger and combined intents.
- **The Warden of Locks:** each round one basic spark is locked (seeded, shown at round start). Players can't attach dominoes to open ends of that spark.
- **The Auditor:** during the cascade, whenever a cap goes off with the same intake spark as the cap that went off just before it, the party takes damage (amount in data; block absorbs it).
- **The Glutton:** heals a fixed amount (data) at the end of every round, up to its maximum health.
- **The Hoarder:** when the cascade starts, gains block equal to the number of dominoes on the board (multiplier in data).
- **The Smolder:** its attack values grow by 2 (data) every round.
- **The Long Night:** its attack this round grows by 1 (data) for each cap the party set off in this round's cascade.

### Run systems
- **Spark Shrine:** any domino attached to the blessed spark adds +1 charge to what passes through it, after its own change.
- **Tinker's Bench:**
  - flip: only amplifiers (one intake spark, one output);
  - repaint: any intake spark, or any output spark of an amplifier or junction.
- **Twin Forge:** only two amplifiers or two junctions can be welded. The weld takes the first domino's intake and effect, and the second's outputs.
- **Wishing Well:** the prize is decided by the turned domino's intake spark. An "any" intake lets the player pick.
- **Mirror Pond, Toll Bridge, Lost Courier, Sleeping Giant:** unchanged.
- **Upgrades:**
  - left side: dual intake, as now, for any kind;
  - right side:
    - Boost +1;
    - Double becomes ×2.5;
    - Echo +1 repeat;
    - Spectrum +1;
    - caps +50%, rounded up;
    - junctions have no right-side upgrade.

  All values in data.
- **Generation:** each rarity first picks a kind (amplifier, junction or cap, weighted in data), then its intake and outputs from the rarity spark pools (as now), then its effect from that rarity's list.
  - Common: Boost +1, Strike, Guard.
  - Uncommon: Boost +2, Echo, junctions, bigger caps, coin caps, the ignores-block trait.
  - Rare: Double, Spectrum, the biggest caps.
- **Unlocks:**
  - Always available: Boost +1, junctions, Strike and Guard.
  - The unlock order (data): advanced sparks, Echo, Boost +2, coin caps, ignores block, Spectrum, Double, the "any" intake.

## What gets rebuilt

- **Engine:** board state, legal plays (any open end), passing and setting off, charge, the cascade and enemy intents. It stays headless and deterministic, with the same `step` and `getView` pattern.
- **Sims and the bot:** rewritten for the new rules. The first measure: how often a turn offers more than one real choice (about 30% today).
- **Combat screen:**
  - a 2D board showing the tree, the open ends and the charge on each path;
  - the enemy's intent;
  - hover highlights the open ends a domino can attach to;
  - the cascade animation, reusing the M8 heat effects, topple, sounds and per-effect animations.
- **Content:** every enemy's intents, the new starter deck, generation pools and the charm and boss rework.
- **Tests:** the battle scenario tests are rewritten.

## Build order

1. **Approved** (2026-11-20).
2. **Engine and sim prototype:** the rules engine, sims and bot, with no screens. Report how many turns offer real choices, chain and branch sizes, and battle lengths.
3. **A playable board screen** with a basic cascade animation, then a playtest.
4. **The spectacle:** the cascade gets the full heat treatment.
5. **Content:** junction branch types (if J1 says later), more amplifiers and caps, the charm and boss rework.
6. **Then re-tune the balance,** and only then port to Godot.
