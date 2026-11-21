# Art spike (#259)

How to make the M12 pixel art: robed wizards, the arcane circle and spells (A1–A12 in `docs/decisions.md`). Each method made the same test set:

- one wizard with 2 hats and 2 robes as layers, recoloured by palette swap;
- an idle and a cast animation;
- a fireball flight loop and impact;
- the circle at its quietest and biggest tiers.

All candidates are on the `art-spike` branch, which never merges. Open `art-spike/picker.html` from disk. It shows each method at ×4 nearest-neighbour over the combat background, with the 8 seat colours and hat and robe swapping, and it plays idle, cast, fireball and impact at game speed.

## How the candidates were made

- **One palette for everything:** 23 colours, in `art-spike/tools/pix.py`. Every method is drawn in it or reduced to it, so methods are compared on equal terms.
- **Recolouring:** robes and hats use a 4-colour key ramp (light, base, dark, deep). At run time the picker swaps those four colours for a ramp built from the seat colour. That is a plain palette swap; a Godot shader does the same.
- **Pixel rules:** a script checks every sheet. Every pixel is fully opaque or fully clear, and every colour is from the palette. All three made methods pass: no half-transparent pixels, no off-palette colours.
- **Seat colours:** the game has 4 today. The picker adds 4 placeholders (violet, green, orange, blue) until A4's palette of 8 is set in data.
- **Times:** these are this session's working times. "Full set" estimates scale them up and add a polish pass.

## 1. Local AI: SDXL + pixel-art-xl LoRA in ComfyUI, then cleanup

- **Drafts:** 34 drafts at 11–16 s each on the RTX 4060 Ti, about 8 minutes of GPU in all. Prompts and seeds are in `art-spike/ai/prompts.jsonl`.
- **Cleanup:** `art-spike/ai/cleanup.py` does it in one pass:
  - cuts out the flat background (flood fill from the border);
  - crops, and shrinks to 32×48 with a box average;
  - reduces every pixel to the palette, and adds the outline.

  Robe purples land on the key ramp, so recolouring works.

**Findings:**

- **Single frames look the best of any method.** But at 32×48 the detail turns to noise: beards and robes lose their shapes.
- **Same seed, changed prompt** ("robe with gold trim") keeps the pose, so a second robe can be cut out as a layer. Asking for a hood or a wide-brimmed hat gave the same pointed hat, so there is only one hat.
- **No animation.**
  - img2img from the base frame keeps the wizard but won't move the staff, even at 0.65 denoise.
  - Text prompts for a cast pose give a different wizard each time.
  - "Sprite sheet of 6 frames" gives 6 different wizards, facing the viewer.
  - The idle in the picker is made by shifting the top half 1 px in code.
  - Getting real animation needs a pose ControlNet (not installed) and hand repair of every frame.
- **Spells:** one usable frame each for the fireball and the impact. There is no loop.
- **Circle:** the model wants stone platforms. Asking for glowing lines gave one usable circle, but the draft is cut off at the edges and stays noisy after cleanup. The quiet tier was made by a palette swap of it, which works well.
- **Licence:**
  - SDXL base: CreativeML Open RAIL++-M. Commercial use is allowed, with use restrictions.
  - pixel-art-xl (nerijs): its model card says CreativeML OpenRAIL-M. **But its file metadata says it was trained on SDXL 0.9, which had a research-only licence.** Check this before shipping anything made with it.
  - AI images may not be protected by copyright.
  - Steam asks games to disclose AI-generated content.

| | Local AI + cleanup |
| --- | --- |
| Quality | Rich still frames, muddy at 32×48. The circle is noisy. |
| Time (spike) | Wizard: 25 min of prompting and picking, plus 30 min writing the cleanup script. Fireball and impact: 5 min. Circle: 10 min. Cast animation: failed after 15 min. |
| Cost | $0 (local GPU) |
| Licence | OpenRAIL; the LoRA's SDXL 0.9 training is a question mark. AI disclosure needed. |
| Layers | Partly: only cuts from same-seed drafts. No second hat. |
| Recolouring | Yes, after reducing to the palette |
| Consistent animation | **No.** Every frame would be drawn or repaired by hand. |
| Ports to Godot | Yes (PNG sheets) |

## 2. Pixel data in code, from layered parts

`art-spike/code/make.py` draws everything in about 400 lines of Python.

- **Wizard layers:** robe (plain, trimmed), body (head, beard, boots), hat (pointed, wide brim with a feather), staff, and hand.
- **Frames:** each frame is a pose: body bob, hand position, staff ends, and gem glow. Every layer reads the same pose, so hats and robes line up on every frame. The hat sits right on the cast frame where the staff is raised; that's the issue's test case.
- **Fireball:** flame blobs with seeded noise, flickering over 4 frames. The impact is a flash, a ring, a broken ring, then embers.
- **Circle:** exact pixel ellipses, a hexagram, 24 runes from 8 glyphs, and a dithered glow.
  - The biggest tier adds a beam and particles.
  - Tiers, variants (glyph sets, ring counts) and ring rotation are all settings.

| | Pixel data in code |
| --- | --- |
| Quality | Clean, readable, consistent and on the grid. Simpler and flatter than hand-drawn art ("good programmer art"). It holds up well at ×4. |
| Time (spike) | Palette and tools: 15 min. Wizard with 2 hats, 2 robes, idle and cast: 45 min. Fireball and impact: 10 min. Both circle tiers: 15 min. |
| Cost | $0 |
| Licence | Ours, original |
| Layers | **Yes:** any hat on any robe on any frame |
| Recolouring | **Yes**, free from the key ramp |
| Consistent animation | **Yes**, by construction |
| Ports to Godot | Yes: it exports PNG sheets, and the script stays the source |

## 3. Packs

No pack has the wizard we need. The only modular wizard source is LPC, at 64×64 and CC-BY-SA, which doesn't fit. Spell packs are plentiful and cheap. No pack has a tilted pixel circle.

- **Tested on the stage:** the CC0 **Teleport circle** by gfroad. It's smooth line art drawn flat from above. `art-spike/packs/make.py` squashes it to the tilted view, thresholds the lines onto the grid and recolours them. The result is usable, but the lines break into speckles where they were thin.
- **The other packs** are linked in the picker from their own preview images. Nothing was bought or downloaded.

All prices and licences below were read from the pack pages on 2026-11-21. Re-read the licence before using anything, and keep a copy with the art.

| Pack | Author | Price | Licence (commercial game) | What it has | Fit |
| --- | --- | --- | --- | --- | --- |
| [Wizard 2D Pixel Art](https://xzany.itch.io/wizard-2d-pixel-art) | xzany | $3 | Commercial OK, no credit, no redistribution | 32×48. Idle 6, attack 10, walk, hurt, death | Right size, but one fixed wizard: no hat or robe layers, no recolour ramp |
| [Universal LPC Spritesheet Generator](https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator) | LPC contributors | Free | Per part; base CC-BY-SA 3.0 + GPL 3.0. Credit every artist; derivatives stay CC-BY-SA | 64×64. Fully layered robes and hats. Spellcast animation | Layered, but the wrong size and a viral licence |
| [Free Pixel Wizard](https://free-game-assets.itch.io/free-wizard-sprite-sheets-pixel-art) | CraftPix | $0+ | Not stated on the page | 3 wizards, PSD + PNG | Unverified |
| [Pixel Magic Sprite Effects](https://foozlecc.itch.io/pixel-magic-sprite-effects) | Foozle | Free | **CC0** | 32×32: fireball, water, wind, tornado, earth, explosion | Good for Ember, Tide and Gale. Needs re-palettising. No lightning, shadow or acid |
| [Magic VFX Pack 1](https://thundersnowpixel.itch.io/magic-vfx-pack-1) | thundersnowpixel | about $3 | Commercial OK, no credit, no redistribution | Fireball, water, thunderbolt, black hole, whirlwind, impact | Covers Storm and Void too. Large (64–96 px), long frame counts |
| [Pixel Art Fire Ball](https://msfrantz.itch.io/free-fire-ball-pixel-art) | msfrantz | Free | Commercial OK, no redistribution | 64×64: shot loop 4, explode 7 | A flight loop and impact, but twice our size |
| [Fire Spells Pixel VFX](https://elvgames.itch.io/fire-spells-pixel-vfx) | ELV Games | $3.99 | "Royalty free"; terms not on the page | Fireball 8 + hit 6, explosions | Unverified terms |
| [Magic Circle 192](https://alisalia.itch.io/magiccircle192) | AlisAlia | $5 | Commercial OK, no resale | 192×192, 32 patterns × 13 colours, flat, still | Would need tilting and animating |
| [Magic Summons](https://srzolda.itch.io/magic-summons) | SrZolda | Free | CC-BY 4.0 (credit) | Animated summon circles, 4 colours | Size and angle not stated |
| [Teleport circle](https://opengameart.org/content/teleport-circle-sprite-sheet) | gfroad | Free | **CC0** | 16 frames of 256×256 line art | Tested above. Usable once adapted |
| [Shield Effect](https://linkninja.itch.io/pixel-art-animation-shield-effect) | linkninja | Free | "Any project, no credit" (terms not checked) | 64×64 shield, Aseprite source | A start for the block ward |

**Nothing found for:** Rot (acid glob), a tilted pixel circle, or a layered wizard near 32×48.

| | Packs |
| --- | --- |
| Quality | Good per pack, but mixing packs mixes styles, sizes and palettes |
| Time (spike) | Research: 20 min. Adapting the circle: 10 min |
| Cost | $0–20 for the spells and circles above |
| Licence | Varies. CC0 (Foozle, gfroad) is cleanest; most paid packs forbid redistributing source |
| Layers | No (wizards) |
| Recolouring | Only after re-palettising each sheet by hand or script |
| Consistent animation | Yes within a pack |
| Ports to Godot | Yes (PNG sheets) |

## 4. Hiring a pixel artist (note only; nobody contacted)

Public rates found on 2026-11-21:

| Source | Rates |
| --- | --- |
| Fiverr gig tiers (from search results; Fiverr blocks scripts) | $5 for a static 64×64 character, $10 with 1 animation, $15 with 3. Other gigs: $1–3 per frame. Cheap tiers often exclude commercial rights. |
| Artists' commission sheets (Aseprite forum, jotform sheets, [arsenespixelcommissions](https://arsenespixelcommissions.carrd.co)) | $30 base + $10 per frame for 32×32 and under. $60 + $15 per frame for 64×64. $2–8 per frame by size. $40–75 per 4–8-frame sprite. |
| [Game Developer: freelance pixel art guidelines](https://www.gamedeveloper.com/production/pixel-art-freelance-best-practices-guidelines) | $15–50 an hour, about $30 median. This is from 2009, so it's a floor today. |

The cost driver is layers × frames. Each hat and robe has to be drawn on every animation frame so it lines up.

| | Hiring an artist |
| --- | --- |
| Quality | The best, and one consistent style |
| Time | 4–8 weeks of the artist's calendar, plus our time on a brief and reviews |
| Cost | About $2,500–7,000 for the full set (breakdown below) |
| Licence | Ours by contract (ask for a full commercial assignment) |
| Layers, recolouring | Yes, if the brief asks for layered sheets in our palette and key ramp |
| Consistent animation | Yes |
| Ports to Godot | Yes (PNG sheets, plus Aseprite sources) |

## The full M12 set: estimates

**The set:**

- **Wizard:** 5 hats and 5 robes as layers, in 8 colours. Idle (4 frames), hurt (3), victory (4) and about 4 casts (6 each). That's about 35 frames, and body, staff, hand and all 10 outfit layers each need all 35.
- **Spells:** 6 damage spells, each a flight loop (4) and an impact (4), plus a block ward recoloured per spark (about 6 frames) and one big final spell (about 10).
- **Circle:** 5 tiers with 2–3 variants each, about 12, animated.

| Method | Time | Cost | Notes |
| --- | --- | --- | --- |
| 1. Local AI + cleanup | 80–120 h | $0 | Hand-drawing or repairing every animation frame dominates. The style drifts between drafts. Licence question. **Not recommended for wizards or animation.** |
| 2. Pixel data in code | 35–50 h of art-session time | $0 | Outfits: 6 h. Animations: 5 h. Spells: 12 h. Circle tiers and variants: 10 h. Polish: 8–15 h. New colours, variants and rotation are free. |
| 3. Packs | 15–25 h adapting, plus wizards from another method | $0–30 | Spells from Foozle (CC0) and thundersnowpixel (about $3), re-palettised. The circle adapted from CC0 line art. No wizards, no acid. |
| 4. Hiring an artist | 4–8 weeks, plus 5–10 h of our time | $2,500–7,000 | Outfit layers × frames (350 layer-frames at $3–8): $1,050–2,800. Body, staff and hand frames: $175–525. Spells: $360–900. Ward and final spell: $120–300. Circle variants: $480–1,440. Plus about 15% for revisions. |

## Wizard round 2

No round-1 wizard was liked: they were too low in detail at 32×48 and clashed with the painted background and the rounded vector UI. Round 2 tried two more code-drawn styles (`art-spike/code2/make.py`, about 45 minutes):

- 48×64 frames, shown at ×3 (the same size on screen as round 1 at ×4, with 1.5× the detail) or ×4.
- Rounded shading worked out from each part's shape (a distance field lit from the upper right), and coloured outlines in each part's own darkest shade instead of one near-black line.
- A soft vector shadow under the feet, drawn by the game like the UI.
- Two styles: **storybook** (tall and flowing, a long beard) and **chibi** (a big round head, a small round body).

Both keep everything that made method 2 work: 2 hats and 2 robes as layers on every frame, run-time recolouring (now a 5-colour key ramp), and a consistent idle and cast. The wizards use 37 colours, more than the 16–24 the issue suggested for the whole set.

## Designer's picks

- **Method 2, pixel data in code, for the wizards, the circle and the spells.**
- **Circle:** round 1's code circle.
- **Wizards:** made in code. The exact style (storybook, chibi or something between) is decided in the M12 art issue, starting from round 2.
- **Scale: ×3.** Wizards are 48×64 art pixels at ×3. The circle and spells get redrawn at ×3 too, so all pixel art shares one pixel size (A10). This updates A10's "about 4 screen pixels" and "roughly 32×48".

## Recommendation

**Use method 2 for the whole M12 set, as picked.**

- **Wizards, circle and spells drawn in code,** at ×3 with 48×64 wizards. That's the only method that gives layers, run-time recolouring and consistent animation without extra work.
- **Packs are a fallback only:** CC0 Foozle effects, re-palettised, for any spell that looks weak.
- **AI for ideas only,** never shipped.
- **An artist polish pass stays optional,** decided after the code set is in the game.

**Full-set estimate:** about 40–60 hours of art-session time, at $0. That's round 1's 35–50 hours, plus the bigger frames and the richer shading.
