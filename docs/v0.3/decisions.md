# Decisions: 0.3

Confirmed rulings for version 0.3. Newest last. They override the 0.2 record (`docs/v0.2/`) and the 0.1 record (`docs/decisions.md`), which stay as they were. The design itself is in `docs/v0.3/design.md`.

Everything recorded as decided in 0.1 and 0.2 counts only as a recommendation for 0.3 unless a 0.3 ruling or the 0.3 design keeps it (D2).

## 2026-11-23: The screen proposals (S1–S16)

From the proposals page "0.3 Screen Proposals" (https://claude.ai/artifact/WqRUyBFHVG2FbDzuterUkJ): the two screens as they were in 0.2, how comparable games lay theirs out, and seven recommendations with mockups (C1–C3 for combat, the wizards, M1–M3 for the map). All as recommended, except S7, S11 and S16.

- **S1 Scope:** 0.3 builds all seven: C1 "One stage", C2 "One look", C3 "The line is the enemy's guard", new wizards, M1 "The whole act, readable", M2 "A scroll on the table" and M3 "Know before you go". S7 and S16 change two of them.
- **S2 The web build:** 0.3's screen work stays in the web build. M13 (Godot port) stays on hold. Positions and sizes stay in data files so they carry over.
- **S3 Milestones:** M16 "The combat stage" (C1–C3 and the wizards) and M17 "The map" (M1–M3), on an integration branch `v0.3`, as 0.2 used `v0.2`.
- **S4 Where the enemy stands:** on the table, to the right of the arcane circle. The party stands on the circle's left arc and the tree grows left to right toward the enemy.
- **S5 Enemy art:** the 22 enemy paintings are converted to pixel sprites by a script. One is redrawn by hand only if its conversion looks wrong.
- **S6 The font:** a pixel font replaces Arial: the Jersey family (Jersey 10 and Jersey 15) and Tiny5. Both are under the SIL Open Font License 1.1, which allows shipping them with the game. They are font files in the repo, not a code dependency.
- **S7 Dominoes keep their 0.2 look.** The pixel tiles with coloured ends were proposed and not taken. Domino drawing, the numbers on dominoes and the tree's smooth shrinking stay as they are.
- **S8 The setting:** the tavern table is the setting for both screens. Battles happen on it, and the map is a scroll unrolled on it.
- **S9 Open hands:** teammates' hands stay in view all the time, as slim racks along the top of the combat screen.
- **S10 Hidden total:** the damage total stays hidden while building (V5 is kept). The line's bar is empty until the cascade.
- **S11 The wizards' look:** the current sprites are replaced. The designer finds them too cartoony and does not want them drawn side-on. The designer's reference is a hooded cloak seen from the front: flat tones, a bold dark outline, a shoulder mantle, a ragged hem, and darkness under the hood. The new wizards follow it. Which of three options (A "Hollow", nothing under the hood; B "Watcher", two eyes in the dark; C "Greybeard", eyes and a beard) is still open. The eight colours and the wardrobe stay; the five hats become five hood and hat shapes and the five robes become five cloaks.
- **S12 Wizard reactions:** the wizards react to placing a domino, a teammate placing next to theirs, pressing Ready, waiting on others, the cascade reaching their domino, their cap going off, bracing for the enemy's hit, taking it, the stagger, the win, low party health, and walking on the map. If the art runs long, low health and waiting are cut first.
- **S13 Roads never cross:** the engine's map maker changes so that no two roads cross. It is the one engine change in 0.3. Old seeds give new maps.
- **S14 What a fight's card shows:** the enemies it can be ("Brute or Warden"). The engine keeps rolling the enemy when the fight starts.
- **S15 0.2's open items:** M12's hand checks (online two-tab sameness, away dimming, 2× and 4× playback, a real lethal cascade, the enemy's hurt animation, the circle's return to rest) and the run-length timing (V10) move into M16's playtest. The Warden of Locks and the stock bot wait for a balance pass after 0.3.
- **S16 No party on the map:** M2's party pieces were proposed and not taken. A vote shows as a small flag in the player's colour on the stop they chose. The scroll on the table, the boss at the end of the road and the bottom strip stay.

### Open

- **Which wizard option (S11).** A, B or C on the proposals page. The planner recommends B. M16's wizard issues are not filed until it is picked.

## 2026-11-23: How 0.3 is built (T1–T7)

Planner defaults for the 0.3 specs. Say if any should change.

- **T1 Integration branch:** 0.3 PRs target `v0.3`, made from the planner's branch (`main` plus the 0.3 docs). `main` and GitHub Pages keep 0.2 playable until the designer has playtested `v0.3`.
- **T2 Order:** the shared parts come first (the font and the small interface kit, and the art conversion), because both screens use them. The map (M17) can be built alongside the combat stage.
- **T3 Other screens:** the menu, lobby, reward, rest, trader and event screens get the new font through the shared text helpers. They are not redesigned in 0.3; a layout is touched only where text no longer fits.
- **T4 What the map screen may work out:** which stops can be reached from a stop comes from an engine function. The screen draws it and does not walk the map itself.
- **T5 Art sources:** the paintings move to `tools/art/sources/` and stay in the repo. The converted sprites replace them in `public/art/`. The conversion is part of `npm run art`.
- **T6 Sizes of pixel art:** converted art sits on the same grid as the wizards (3 screen pixels per art pixel at 1920×1080).
- **T7 Interface kit:** bars, plates and buttons are drawn in code on that grid, from numbers in `data/presentation.json`. No image files.
