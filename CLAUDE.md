# CLAUDE.md

Pass the Spark is a turn-based co-op deckbuilder. It will be built as a web MVP in TypeScript, hosted on GitHub Pages, then ported to Godot.

## Where the spec lives

- **GitHub issues are the spec.** Build what the issue asks, nothing more. If something is unclear or seems wrong, ask in the issue instead of guessing.
- `docs/decisions.md` holds confirmed rulings and overrides `docs/pass-the-spark-build-brief.md`.
- `docs/chain_sim.py` is a reference for rule order only. Don't port its structure.

## Engine principles

- The rules engine is headless, with no DOM, browser, network, timer or `Math.random` calls. UI and networking come later and sit on top of it.
- It's deterministic: the same seed and the same player choices always produce the same result. All randomness goes through the engine's seeded random-number generator.
- Game state is plain, serializable data. Players change it only by submitting choices to the engine.
- Every content item and number (dominoes, enemies, health, values) lives in data files, not in code.
- Keep it easy to port to GDScript: plain functions and data, no clever type-level tricks, no heavy frameworks.

## Testing: keep it lean

- Write few tests, and make each one count. Test rules and behaviour that could realistically break, not every function.
- Prefer a handful of scenario tests (seed + choices → expected state) over many small unit tests.
- Don't test trivial code, data files, types or the testing setup itself.
- When you fix a bug, add one regression test for it.
- Don't add tests beyond what the issue calls for. If in doubt, write fewer.

## Code

- Keep it simple. Don't add abstractions, options or extension points that no issue asks for.
- Ask before adding a dependency.
- Run type-checking and tests before opening a PR.
- Work on one branch per issue, open a small PR that references the issue, and don't mix unrelated changes into it.

## Commands

- `npm ci`: install dependencies.
- `npm run typecheck`: type-check with `tsc --noEmit`.
- `npm test`: run the Vitest tests once.
