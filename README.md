# Pass the Spark

A 2D online co-op game.

## Plan

- **MVP:** web app, deployed to GitHub Pages for early testing.
- **Later:** port to Godot.

Because of the planned port, the core rules engine stays independent of any
platform: no browser, DOM, or networking code, and plain data in and out. Its
behaviour is pinned down by test cases that the Godot version must also pass.

## Milestones

1. **Rules engine (current):** headless, deterministic combat rules with unit tests.
   No UI or networking.
2. Later milestones will be tracked in GitHub issues.

## Docs

- `docs/pass-the-spark-build-brief.md`: the design brief (2026-11-18).
- `docs/chain_sim.py`: Monte Carlo model of the chain rules. A reference for rule order, not production code.
- Work is specified in GitHub issues; see the Issues tab.
