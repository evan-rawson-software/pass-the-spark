# Pass the Spark

A 2D online co-op game.

## Plan

- **MVP:** web app, deployed to GitHub Pages for early testing.
- **Later:** port to Godot.

Because of the planned port, the core rules engine stays independent of any
platform: no browser, DOM, or networking code, and plain data in and out. Its
behaviour is pinned down by test cases that the Godot version must also pass.

## Milestones

1. **Rules engine:** headless, deterministic combat rules. Done.
2. **Combat on one machine:** the browser game, single player. Done.
3. **Online co-op:** peer-to-peer rooms, host runs the engine. Done.
4. **The run:** map, rewards, rest sites, upgrades, Trader, one act and one boss. Done.
5. **Events:** the question-mark events on the map. Done.
6. **Charms, acts 2 and 3:** personal charms, more enemies and bosses, a 3-act run. Done.
7. **Balance pass:** numbers tuned from sims and playtests, plus playtest fixes. Done.
8. **Progression and polish:** experience bar and unlocks, chain spectacle, audio, art. Done.
9. **Branching cascade:** the combat redesign in `docs/design-branching-cascade.md`. Done.
10. **Cascade feel:** more effects, animations and sounds in combat, so a chain going off feels amazing. Done.
11. **Playtest fixes:** starter and reward numbers, no manual set off, every sound remade, and the hand as a straight row. Done.
12. **Wizards and spells:** pixel-art wizards you customize, an arcane circle and spells for caps. The art and the lobby wardrobe are done; wizards and spells in battle wait for M14's combat screen.
13. **Godot port:** engine and screens rebuilt in Godot, Steam lobbies. On hold until 0.2 has been playtested.
14. **0.2: The new round (current):** everyone builds at the same time on a budget, every domino hits, and each enemy has a line to beat.
15. **0.2: Rules-changing content:** enemy traits, spark traits and wizard schools. Specified after the M14 playtest.

Each milestone's issues are in the GitHub milestone with the same "M" number in its title.

## Docs

- `docs/v0.2/design.md` and `docs/v0.2/decisions.md`: the 0.2 design and rulings. They win over the 0.1 docs.
- `docs/pass-the-spark-build-brief.md`: the design brief (2026-11-18).
- `docs/chain_sim.py`: Monte Carlo model of the chain rules. A reference for rule order, not production code.
- Work is specified in GitHub issues; see the Issues tab.
