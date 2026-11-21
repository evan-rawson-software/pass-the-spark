# Decisions: 0.2

Confirmed rulings for version 0.2. Newest last. They override the 0.1 record (`docs/decisions.md`, the build brief and `docs/design-branching-cascade.md`), which stays as it was. The rules themselves are in `docs/v0.2/design.md`.

Everything recorded as decided in 0.1 counts only as a recommendation for 0.2 unless a 0.2 ruling or the 0.2 design keeps it.

## 2026-11-21: The three recommendations (V1–V10)

From the proposals page "Pass the Spark 0.2 Proposals" (https://claude.ai/artifact/WPedf7Zu2EQucRJGiFbnWY): measurements of 0.1, research on comparable games, and scratch sims. All as recommended.

- **V1 Scope and order:** all three recommendations. Recommendations 1 (build at the same time, on a budget) and 2 (the cascade as a combo with a line to beat) are built together first, in M14. Recommendation 3 (enemies and sparks that change the rules) follows in M15.
- **V2 The budget:** 12 placements a round for the party, split evenly: 6, 4 or 3 each for 2, 3 or 4 players. Hand size is your placements + 2.
- **V3 Every domino hits:** amplifiers and junctions hit for the charge they pass on as they light; caps hit for base × charge as before.
- **V4 The line:** each enemy has a line. A cascade whose combo total reaches it staggers the enemy, halving its attack that round.
- **V5 Hidden total:** the screen hides the damage total until the cascade fires, and shows every domino's number and the line. This is one setting; decide for good after the first M14 playtest.
- **V6 M12:** the art (#261, #263) and the lobby wardrobe (#262) finish. #264 and #265 are paused until the M14 combat screen lands, because M14 rearranges the screen they build on.
- **V7 M13 (Godot port):** stays on hold until 0.2 has been playtested in the web build.
- **V8 Where 0.2's record lives:** `docs/v0.2/design.md` for the rules and this file for rulings. The three 0.1 docs keep their text, with one pointer line at the top.
- **V9 The balance yardstick:** the sims get a planning bot beside the stock bot, and balance targets are measured against it. It is the first 0.2 issue.
- **V10 Run length:** the target is about 2 hours for a four-player run. Time it at the first M14 playtest; cut floors per act only if it runs over.

## 2026-11-21: How M14 is built (B1–B12)

Planner defaults for the M14 spec, accepted with V1–V10 ("rec"). Say if any should change.

- **B1 Milestones:** M14 "The new round" (recommendations 1 and 2) and M15 "Rules-changing content" (recommendation 3). M12 keeps its number; M13 stays on hold.
- **B2 Integration branch:** M14 PRs target a `v0.2` branch made from `main`, as M9 used `cascade`. `main` and GitHub Pages keep 0.1 playable until `v0.2` is playable end to end, then it merges. `v0.2` may fail typecheck and tests between the engine issues and the screen issues; each PR keeps its own new tests passing and lists the known failures. `main` is merged into `v0.2` as M12 work lands.
- **B3 Ready:** while you are Ready you can't place or take back. Teammates' plays don't change your Ready. When every player is Ready the cascade fires, even on an empty board. An away player counts as Ready once the existing 60-second delay has passed, so a short drop can't fire the cascade without them.
- **B4 Taking back:** only your own domino, only while nothing hangs from it. The placement is refunded.
- **B5 Simultaneous play online:** the host applies choices in arrival order. A choice that is no longer legal is refused with a message to that player only.
- **B6 The combo total:** the sum of every hit value before enemy block. It is what the combo counter shows and what is compared with the line.
- **B7 Stagger:** each attack hit is halved, rounded down, after growth and the party-size attack percent. Block intents are not halved.
- **B8 What stays visible:** each domino's own number, the line, and the block the party would gain. The damage total, the health-bar damage ghost, the lethal skull and "Pass and fire" go.
- **B9 Party-size tables:** both stay in data, set to 100 for every size. Tuning aims to leave them there.
- **B10 Charms until M15:** Early Riser is +1 hand size, Deep Pockets +2. Neither adds placements. Every other charm keeps its 0.1 wording.
- **B11 The lead:** battles have no lead. The run still rotates a starting seat each battle, used only by the Sleeping Giant's turn order.
- **B12 Hype tiers:** set by the combo total as a share of the line (data thresholds, starting at 25%, 50% and 75%), then the line itself, then lethal. This replaces tiers by share of enemy health (H2).

## 2026-11-21: Planning M15 (C1–C4)

All as recommended ("rec").

- **C1 When:** M15 is specified after the M14 playtest, not before. Its content is judged against the budget, the line and the combo, which M14's tuning and playtest may still change.
- **C2 Brainstorm now:** a first shortlist of enemy traits, spark traits and wizard schools is drafted outside the repo and brought to the planner. Nothing from it is decided until C4.
- **C3 Prototype after the gate:** once #272 merges, the planner tests the strongest 4–5 enemy traits and the spark traits in scratch sims on the 0.2 engine with the planning bot. The yardstick: a trait earns its place if it changes the best tree, not just the numbers. No issues and no repo code.
- **C4 Spec:** after the playtest, the planner writes the M15 epic (#278) and its issues from C2, C3 and the playtest notes.

## 2026-11-21: M15 trait sims (C5–C9)

From the C3 scratch sims on `v0.2` after #272: the planning bot against normal enemies with the placeholder numbers, at 2–4 players. The "same tree" measure proved too noisy, because many trees score about the same. Traits were judged by what they do to the fight instead: rounds, combo, tree depth and health lost. All as recommended ("rec"). These stay direction for M15 until C4.

- **C5 Low Ceiling stays:** only the first N steps fire, with N set per enemy at 5 or 6. It is the strongest trait. With N = 5 the tree goes from depth 7 to under 5 and the combo halves. N = 4 is too harsh: elites were won only 61% of the time.
- **C6 Lock means no caps on the locked spark:** you can still build through that spark. A full lock breaks the Ember, Tide, Gale loop: fights take 6–10 rounds, and elites were won only 33–53% of the time. This applies to the Warden of Locks too, when M15 reworks it.
- **C7 Dropped or sent back:**
  - **Narrow Pass** is dropped. Under 0.2, long chains beat branching, so limiting open ends costs nothing; the party even did slightly better.
  - **Swarm with carry-over** is dropped. It changed nothing.
  - **Swarm without carry-over** stays in reserve; it is mild.
  - **Rot Seed** goes back for a redesign. Planted as the opener, it acted as a free extra domino.
- **C8 Spark traits:**
  - **Ember: Kindle**, each hit on an Ember end +1, flat. "+1 charge" raised the combo about 45%, which is too strong.
  - **Tide: Wake at 1 block** for each domino on a Tide end. At 2 block the party lost almost no health. The value of 1 is not yet measured.
  - **Gale: Tailwind**, the party's first domino on a Gale end each round is free.
  - **Storm, Void and Rot** wait for the reward dominoes that bring those sparks.
- **C9 The yardstick's search:** the planning bot's narrow search (3 trees kept per step) leaves it about 15–20% below a wider one (12 trees), at 3 players a combo of 83 against 100. #274 keeps the current bot for its tuning loop, reports a wide-search check beside it, and aims at the wide-search numbers if the two differ by more than one round per fight.
