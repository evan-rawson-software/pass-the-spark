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
4. **The run:** map, rewards, rest sites, upgrades, Trader, one act and one boss.
5. **Events (current):** the question-mark events on the map.
6. **Charms, acts 2 and 3:** personal charms, more enemies and bosses, a 3-act run.
7. **Balance pass:** numbers tuned from sims and playtests, plus playtest fixes.
8. **Progression and polish:** experience bar and unlocks, chain spectacle, audio, art.
9. **Godot port:** engine and screens rebuilt in Godot, Steam lobbies.

Each milestone's issues are in the GitHub milestone of the same number.

## Docs

- `docs/pass-the-spark-build-brief.md`: the design brief (2026-11-18).
- `docs/chain_sim.py`: Monte Carlo model of the chain rules. A reference for rule order, not production code.
- Work is specified in GitHub issues; see the Issues tab.
