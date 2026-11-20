# Design: branching cascade chains

> **DRAFT, not approved.** Don't build from this document until the designer approves it and issues are written. Where this draft and `docs/decisions.md` disagree, `docs/decisions.md` still wins until then.

This replaces the core combat rules. The party builds a branching chain of dominoes together, and nothing happens until it's finished. Then the whole chain goes off at once in one big, flashy cascade. The enemy no longer plays dominoes: it shows its next move (its intent), Slay the Spire style.

Designer direction so far (2026-11-20):
- The chain builds first and resolves all at once when it's done, in a cascading, flashy sequence.
- The chain branches: some dominoes are played sideways to start new branches.
- There are three kinds of domino: **junctions** (make branches), **amplifiers** (build up the chain) and **effect dominoes** that cap the end of a branch. Most dominoes have no effect of their own; the effects are on the caps.
- Enemies don't play dominoes. They have intents: "deal X damage", "gain X block", and so on.

This reverses three items from the brief's "decided against" list: finishers (caps are finishers), an End Chain option (see "A turn"), and enemy intents outside dominoes. These reversals are deliberate.

Items marked **Open** need a designer decision. Each has a recommendation.

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
- **Choosing the next intent:** each enemy has a pattern in data, either a fixed cycle or weighted random with no more than 2 of the same in a row. Rec: support both; most enemies use a short cycle so players can learn them.
- **Block:** enemy block gained from an intent absorbs the party's damage in the next cascade, then resets after that cascade.
- **Health, tiers, coins and rewards** stay as they are. Enemy hands, decks, reactions, leftovers, Reflect and reveals are removed.
- Boss passives need redesigning (see "Mapping").

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

What happens to each existing piece. **Open M1:** approve this mapping, or mark the ones to change.

**Effects and traits**
- Damage and block: become caps.
- Amplify: becomes the Boost amplifier.
- Echo: an amplifier (caps further along its path go off twice).
- Spectrum: an amplifier.
- Ignores block: stays as a cap trait.
- Lookout: dropped. Nothing is hidden any more.
- Mimic: dropped for now. Could return as a cap that copies the nearest other cap.
- Heal and Reflect: dropped. They were enemy-only.

**Charms**
- Lenses (Ember, Tide, Gale): +2 to your caps set off by that spark.
- Bulwark: +2 to your block caps.
- Deep Pockets, Early Riser, Coin Purse, Haggler: unchanged.
- Resonance: your Echo amplifiers add 1 more repeat.
- Prism: your Spectrum amplifiers count 1 extra spark.
- Lightning Rod: your caps set off by Storm or Void go off twice.
- Keystone: your amplifiers add +1 more charge.
- First Echo: your first cap each round goes off twice.
- Redesign: Spark Starter (opener effect), Spyglass (Lookout), Lap Runner (laps), Overcharge (laps), Hall of Mirrors (Mimic).

**Bosses and elites**
- Every enemy gets intents in place of its deck (placeholder intents by the coders, as with M4 content).
- Warden of Locks: keeps its passive. Players can't attach to the locked spark.
- Auditor: redesign. Candidate: the party takes damage for each cap set off by the same spark as the previous cap.
- Glutton: redesign. Candidate: heals each round.
- Hoarder: redesign. Candidate: gains block equal to the number of dominoes on the board.
- Smolder: redesign (leftovers are gone). Candidate: its attack grows by 2 every round.
- Long Night: redesign (laps are gone). Candidate: its attack grows with each cap the party sets off.

The boss redesigns need designer approval; these are only starting points.

**Run systems**
- Spark Shrine: dominoes attached to the blessed spark add +1 charge.
- Tinker's Bench: flip only works on amplifiers (caps have no output). Repaint works as now.
- Twin Forge: the weld takes the first domino's intake and effect and the second domino's output. Only allowed when the result is a valid kind.
- Wishing Well: the prize is decided by the turned domino's intake spark, since caps have no output.
- Mirror Pond, Toll Bridge, Lost Courier, Sleeping Giant: unchanged.
- **Upgrades:**
  - left side: dual intake, as now;
  - right side: amplifiers get a bigger boost, caps +50%, junctions can't be upgraded on the right.
- **Generation:** the pools per rarity choose a kind first (amplifier, junction or cap), then its spark and effect, using the rarity spark pools as now. Caps have no output.
- **Unlocks:** the unlock list becomes the new amplifier and cap kinds.

**Starter deck** (10 dominoes, proposal):
- 4 Boost amplifiers (+1), covering each basic spark in and a different one out;
- 2 junctions;
- 2 Strike caps (damage 3);
- 2 Guard caps (block 3).

**Decided (S1):** this mix, aiming for every hand to usually hold at least one of each kind. Numbers in data.

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

1. **Approve this document.** J1, T1, H1 and S1 are decided; M1 (the mapping) is open.
2. **Engine and sim prototype:** the rules engine, sims and bot, with no screens. Report how many turns offer real choices, chain and branch sizes, and battle lengths.
3. **A playable board screen** with a basic cascade animation, then a playtest.
4. **The spectacle:** the cascade gets the full heat treatment.
5. **Content:** junction branch types (if J1 says later), more amplifiers and caps, the charm and boss rework.
6. **Then re-tune the balance,** and only then port to Godot.
