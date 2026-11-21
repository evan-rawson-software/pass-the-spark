# Pixel art generator

All M12 pixel art is drawn as pixel data in code (decisions: "Art method and pixel scale", Z3). This folder makes it; the game only reads the results. Only the art machine needs to run it.

## Setup and run

- Python 3 with Pillow (`pip install pillow`). Nothing else.
- `npm run art` rebuilds everything:
  - `public/art/wizards/*.png`;
  - their lines in `public/art/manifest.json`;
  - `data/wizard-art.json`.

  It then runs the check, and fails if anything breaks the pixel rules.
- `python tools/art/check.py` runs the check on its own.
- `python tools/art/palette.py` prints how distinct and readable the 8 seat colours are.
- The output is deterministic: the same code always writes the same bytes, so a diff shows only real changes.

## Files

- `pix.py`: shapes, the rounded shading with coloured outlines, layers and sheets.
- `palette.py`: the key greys, the fixed ramps, the 8 seat colours and their checks. Every sheet colour must be in `PALETTE`.
- `wizards.py`: the wizard.
  - `STYLE` holds its proportions. The designer picked style A, "tall", as a placeholder in #261; a restyle means changing these numbers.
  - `HATS` and `ROBES` are the outfits.
  - `ANIMATIONS` lists every pose, frame time, loop flag and cast release frame.
- `build.py`: writes the sheets, the manifest lines and `data/wizard-art.json`.
- `check.py`: the pixel rules. Every pixel is fully opaque or fully clear, and every colour is from the palette.
- `preview.html`: puts wizards together and recolours them the way the game will. Run `npm run dev`, then open `/pass-the-spark/tools/art/preview.html`.

## Rules

- **Scale and frame:** ×3 screen pixels per art pixel, nearest-neighbour only. Wizard frames are 48×64, drawn facing right; the game mirrors them.
- **Recolouring:** robes and hats are drawn in the 5 key greys. The game swaps `keyRamp[i]` for a colour's `ramp[i]`. The middle shade, `ramp[2]`, is the seat colour the interface uses.
- **Light:** mostly from above, so a mirrored wizard still looks right. No text or one-sided detail on the sprites.
- **Points:** every new pose needs its staff tip and feet. `build.py` works them out from the pose.
