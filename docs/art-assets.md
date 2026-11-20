# Art assets

This is the list of images the game can use, for generating art locally. The game draws everything in code today. When an image listed here exists and is in the manifest, the web game shows it instead. Otherwise it falls back to the code-drawn version (issue: "Show generated art where it exists"). The same files will carry over to the Godot version.

## Rules for every file

- **Where:** `public/art/<folder>/<id>.<ext>`. Folders and ids are listed below. Ids match the data files (`data/enemies.json`, `data/charms.json`, `data/events.json`), so a renamed enemy keeps its art.
- **Manifest:** `public/art/manifest.json` lists every file that exists, as paths relative to `public/art/`, for example `["enemies/ogre.png", "sparks/Ember.png"]`. The game loads only what's listed. Add each new file to it.
- **Formats:**
  - PNG with a transparent background for icons, portraits, tiles and map stops;
  - JPG (quality about 85) for backgrounds and event illustrations, which fill their whole frame.
- **Size budget:** icons under 100 KB, enemy portraits under 600 KB, event illustrations under 400 KB, backgrounds under 1 MB. Shrink or recompress anything bigger. The whole `public/art/` folder should stay under about 60 MB.
- **No text in images.** The game draws all names and numbers itself.
- **Generate big, ship small:** generate at the model's native size, then downscale to the sizes below. Leave about 8% padding inside the frame for icons, so outlines and glows aren't clipped.
- **Transparency:** most models can't make transparent images. Generate on a plain, flat background and remove it (for example with `rembg`), then check the edges.

## Style

Approved by the designer from the style test (2026-11-19). Every batch uses these exact settings and words so sets match.

- **Icons** (sparks, effects, ui markers, charms, map stops): flat, outlined, simple. A single centred object, thick black outline, flat colour fills, minimal shading. They must read at 48 px.
- **Sparks** are flat runes: thick strokes in the spark's colour with a black outline, holes left open. No white anywhere in a rune, because enclosed white is keyed out.
- **Enemies** are detailed, hand-painted characters with crisp ink linework and warm rim light, cut out with no ground shadow.
- Generate a whole set with the same model, settings, style words and negative prompt.

**Model and settings:** ComfyUI with `flux1-schnell-fp8.safetensors`, 4 steps, CFG 1.0, sampler `euler`, scheduler `simple`, rendered at 1024×1024. Each prompt is `<subject>. <style words>.`, where the subject names the object, its colours and, for sparks, the hex colour and shape.

**Style words:**

- Icons: `flat vector game icon, a single centred symbol, thick bold black outline, flat solid colour fills, minimal cel shading, no gradients, no shadow, isolated on a plain flat pure white background, no text`
- Spark runes: `flat rune glyph icon, an ancient runic symbol drawn with thick bold strokes, thick black outline around every stroke, one flat solid colour, no fill inside the shapes, no gradients, no shadow, isolated on a plain flat pure white background, no text`
- Tiles: `flat vector game asset, top-down orthographic view, a single blank wide rectangular plaque exactly twice as wide as it is tall, rounded corners, filling the frame, thick bold black outline, flat solid colour fills, minimal cel shading, no gradients, no shadow, isolated on a plain flat pure white background, no text`. Say "plaque", not "domino": the word domino makes the model add pips and dividers. Add "the inner face is completely smooth, empty and unmarked" to the subject. Render at 1408×704 and stretch to exactly 480×240.
- Enemies: `highly detailed fantasy character illustration, hand-painted tabletop fantasy art, intricate textures, crisp dark ink linework, warm golden light with rim light, rich colour, clean readable silhouette, no ground shadow, isolated on a plain flat pure white background, no text`
- Events: `hand-painted tabletop fantasy illustration, painterly brushwork, crisp dark ink linework, warm golden light, rich colour, the subject clearly centred, full frame scene, no text, no letters, no signature`. Render at 896×1120.
- Backgrounds: `hand-painted tabletop fantasy background painting, painterly brushwork, soft muted colours, low contrast, gentle warm light, calm and uncluttered in the middle, no characters, no people, no text, no letters, no signature`. Render at 1920×1088.

Scenes almost always get a painted artist signature in a bottom corner, and anything with a sign or milestone gets lettering. Ask for "no signs, no writing anywhere" when the scene could have one, cut the bottom 10% off the render (and the sides, to keep the aspect), then check the edges at full size. Skip the cut when the bottom is clean and holds part of the design, like the map's border.

**Negative prompt:** `text, letters, words, numbers, watermark, signature, border, frame, multiple objects, photo, photorealistic, 3d render, blurry, cluttered background, gradient, drop shadow`. Flux schnell runs at CFG 1, so it ignores the negative prompt; it is logged for completeness, and the "no text, no shadow" wording in the style words is what counts.

**Background removal:** icons remove the flat white background by colour, from the border inward (runes also clear enclosed white). If a pale ground shadow is left, widen the colour tolerance rather than using `rembg`, which can punch holes in flat icons. Enemies use `rembg` with the `isnet-general-use` model. Check every enemy for painted signatures or letter-like markings before shipping. Coins tend to get a "$" or other letters stamped on them: ask for "plain smooth blank gold coins with no markings", show them stacked or edge-on, or leave them out. Then crop to the subject, pad 8% and downscale. A PNG over budget can be reduced to 256 colours (Pillow `quantize`), which is usually invisible for flat art.

**Approved style test examples:** `sparks/Ember.png`, `sparks/Tide.png`, `effects/damage.png`, `effects/block.png`, `enemies/ogre.png`, `charms/ember_lens.png`.
- **Spark colours are fixed** (from `src/game/sparks.ts`). Anything tied to a spark uses its colour and shape:

  | Spark | Colour | Shape |
  | --- | --- | --- |
  | Ember | `#ff6a13` orange | circle |
  | Tide | `#2f80ed` blue | wave |
  | Gale | `#4cc46a` green | triangle |
  | Storm | `#f2c200` yellow | diamond |
  | Void | `#7b3fc4` purple | ring |
  | Rot | `#8a6d3b` brown | blot |

## The list

The branching cascade redesign (M9, `docs/design-branching-cascade.md`) changed some of this list:
- **New:** `charms/junction_runner.png` (a forked signpost), for the charm that replaces Lap Runner.
- **Retired once the `cascade` branch merges into `main`:** `charms/lap_runner.png`, `ui/spectrum.png`, `ui/no_lap.png` and `tiles/enemy.png`. `main` still uses them until then, so keep the files and their manifest entries for now.

### Sparks: `sparks/<Spark>.png`, 256×256, transparent
`Ember`, `Tide`, `Gale`, `Storm`, `Void`, `Rot`. A glowing glyph in the spark's colour and shape. These sit on domino halves, so keep them simple.

### Effects: drawn in code
**Not generated.** All effect icons are drawn in code in one consistent style, by designer choice. Don't add any `effects/` files to the manifest. Under the branching cascade (M9) they are: caps `damage`, `block`, `coins`; amplifiers `boost`, `double`, `echo`, `spectrum`; and `junction`.

### Effects textures: `fx/<id>.png`, 256×256, transparent (optional)
For the cascade effects in M10 (#188). Every one has a code-drawn fallback, so make only the ones that clearly look better than code. The game tints them in code, so draw each **white to light grey on a plain flat black background**, then turn brightness into transparency (black becomes fully transparent, white fully opaque) instead of colour-keying. Soft edges are welcome here, unlike the icons.

| Id | What |
| --- | --- |
| `glow` | A soft round glow, brightest in the middle, fading to nothing at the edge. |
| `spark` | A small four-pointed star particle with a soft halo. |
| `slash` | A curved blade streak, sharp at one end, trailing off at the other. |
| `bolt` | A short jagged energy bolt, horizontal. |
| `shard` | One broken fragment, for shattering shields and enemy deaths. |
| `ring` | A thin shockwave ring with a soft edge, for impacts. |

Use the icon style words with "glowing magical energy effect" in the subject, but drop "thick bold black outline" and change "isolated on a plain flat pure white background" to "isolated on a plain flat pure black background".

### Traits and markers: `ui/<id>.png`, 128×128, transparent
`ignores_block` (arrow through a shield), `locked` (padlock), `blessed` (halo or sun), `coin`, `health` (heart), `charm_normal` (round frame), `charm_rare` (gold diamond frame). The HUD block shield is drawn in code, not generated. `spectrum` and `no_lap` are no longer used after M9.

### Domino tiles: `tiles/<id>.png`, 480×240, transparent
`starter`, `common`, `uncommon`, `rare`, `hidden` (face-down back). `enemy` is no longer used after M9: enemies don't play dominoes. A completely blank face with no divider lines: the game draws its own intake, effect and output columns, the sparks, effect icons and numbers on top. Keep the face light so dark numbers stay readable. Rarity can show in the frame (plain, silver, gold). The same tile is used for amplifiers, junctions and caps; the game draws the difference.

### Enemies: `enemies/<id>.png`, 768×768, transparent
Portrait, head and shoulders or full body, facing slightly toward the viewer.

| Id | Tier | Notes |
| --- | --- | --- |
| `ogre` | normal | Big, dim, loud |
| `goblin` | normal | Small, sneaky, a knife |
| `slime` | normal | Glossy blob |
| `wisp` | normal | Floating will-o'-the-wisp |
| `bandit` | normal | Masked road thief |
| `golem` | normal | Stone construct |
| `harpy` | normal | Winged, screeching |
| `wraith` | normal | Hooded spectre |
| `colossus` | normal | Huge armoured giant |
| `stormling` | normal | Small creature crackling with yellow lightning |
| `brute` | elite | Hulking, scarred |
| `warden` | elite | Armoured guard with a great shield |
| `ravager` | elite | Feral, clawed |
| `sentinel` | elite | Tall armoured watcher |
| `tyrant` | elite | Crowned warlord on a throne |
| `warlord` | elite | Battle-hardened commander |
| `auditor` | boss | A ledger-keeper with quills and scales; punishes repeated sparks |
| `glutton` | boss | Enormous, always eating; heals every round |
| `hoarder` | boss | Hunched on a pile of shields and treasure; gains block |
| `smolder` | boss | A smouldering coal beast, embers leaking from cracks |
| `long_night` | boss | A moon-faced shadow; hits harder the bigger the party's cascade |
| `warden_of_locks` | boss | A jailer covered in padlocks and chains |

Most normal enemy and elite names are placeholders. Keep the ids, and design freely.

### Events: `events/<id>.jpg`, 800×1000, full frame
`toll_bridge`, `tinkers_bench`, `wishing_well`, `sleeping_giant`, `spark_shrine`, `lost_courier`, `mirror_pond`, `twin_forge`. Scene illustrations, shown on the left of the event screen. The game crops to fit, so keep the subject centred.

### Charms: `charms/<id>.png`, 256×256, transparent
Normal: `ember_lens`, `tide_lens`, `gale_lens`, `deep_pockets`, `early_riser`, `spark_starter`, `spyglass`, `bulwark`, `resonance`, `junction_runner`, `coin_purse`, `haggler`.
Rare: `prism`, `overcharge`, `first_echo`, `keystone`, `hall_of_mirrors`, `lightning_rod`.
One trinket each (a lens in the spark's colour, a deep pouch, a rooster or sunrise, a striking flint, a spyglass, a tower shield, a tuning fork, a forked signpost, a coin purse, a merchant's scale; rare: a prism, a crackling battery or crystal, a double bell, an arch keystone, a mirror maze, a lightning rod). Rare charms look more precious, with gold and a glow.

### Map stops: `map/<type>.png`, 192×192, transparent
`fight` (crossed swords), `elite` (horned skull), `boss` (crown), `rest` (campfire), `trader` (merchant's tent), `event` (question-mark sign or mystery door), `hidden` (fog or cloud).

### Backgrounds: `backgrounds/<id>.jpg`, 1920×1080
`combat` (a wooden table in a lantern-lit tavern, seen from above at an angle; the middle stays calm so dominoes read clearly), `map` (an old parchment map texture), `title` (a moody tavern scene), `rest` (a campfire at night), `trader` (a market stall), `act_transition` (a road at dusk). Keep backgrounds low in contrast so the game drawn on top stays readable.

## Order of work

1. A style test: 2 sparks, 2 effects, 1 enemy and 1 charm. The designer approves the look before anything else.
2. Sparks, effects, tiles and the `ui` markers. They appear on every screen.
3. Enemies (bosses first), then charms, then map stops.
4. Events and backgrounds.
