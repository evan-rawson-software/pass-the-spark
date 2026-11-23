# Pixel art generator

All M12 pixel art is drawn as pixel data in code (decisions: "Art method and pixel scale", Z3). This folder makes it; the game only reads the results. Only the art machine needs to run it.

## Setup and run

- Python 3 with Pillow (`pip install pillow`). Nothing else.
- `npm run art` rebuilds everything:
  - `public/art/wizards/`, `circle/` and `spells/`;
  - the converted art in `public/art/enemies/`, `backgrounds/`, `map/`, `ui/` and `charms/`, and the map's scroll (`map/scroll.png`);
  - their lines in `public/art/manifest.json`;
  - `data/wizard-art.json` and `data/enemy-art.json`.

  It then runs the check, and fails if anything breaks the pixel rules.
- `python tools/art/check.py` runs the check on its own.
- `python tools/art/palette.py` prints how distinct and readable the 8 seat colours are.
- The output is deterministic: the same code always writes the same bytes, so a diff shows only real changes.

## Files

- `pix.py`: shapes, the rounded shading with coloured outlines, layers and sheets.
- `palette.py`: the key greys, the fixed ramps, the 8 seat colours and their checks, and a ramp per spark (its middle shade is the spark's colour). Every sheet colour must be in `PALETTE`.
- `wizards.py`: the wizard.
  - `STYLE` holds its proportions. The designer picked style A, "tall", as a placeholder in #261; a restyle means changing these numbers.
  - `HATS` and `ROBES` are the outfits.
  - `ANIMATIONS` lists every pose, frame time, loop flag and cast release frame.
- `circle.py`: the arcane circle: 5 tiers (base, glow and particle layers) in 3 variants, all looping, and the lethal beam. Busy detail stays at the rim; the middle, under the tree, stays dim.
- `spells.py`: a damage spell per spark (flight and impact) in the spark's ramp, and the ward and final spell in the key greys.
- `convert.py`: puts the paintings in `sources/` onto the pixel grid (T5, T6): the 22 enemies (`ENEMIES` holds each one's flip flag and alpha cut-off, `TIER_HEIGHT` the height per tier), the six backgrounds (640×360) and the small icons. The paintings stay in `sources/`; only the converted files go to `public/art/`, under their old names (backgrounds are now PNG).
- `scroll.py`: the parchment the map is drawn on, and its map area.
- `build.py`: writes the sheets, the manifest lines and `data/wizard-art.json`.
- `check.py`: the pixel rules. Every pixel is fully opaque or fully clear, and every colour is from the palette. Converted art only has to pass the first rule: its colours come from the paintings.
- `preview.html`: the contact sheet of all 22 enemies on the combat background, the scroll, and it puts wizards together and recolours them the way the game will, steps the circle through its tiers, and plays every spell, the wards and the final spell. Run `npm run dev`, then open `/pass-the-spark/tools/art/preview.html`.

## Rules

- **Scale and frame:** ×3 screen pixels per art pixel, nearest-neighbour only. Wizard frames are 48×64, drawn facing right; the game mirrors them.
- **Recolouring:** robes and hats are drawn in the 5 key greys. The game swaps `keyRamp[i]` for a colour's `ramp[i]`. The middle shade, `ramp[2]`, is the seat colour the interface uses.
- **Light:** mostly from above, so a mirrored wizard still looks right. No text or one-sided detail on the sprites.
- **Points:** every new pose needs its staff tip and feet. `build.py` works them out from the pose.
