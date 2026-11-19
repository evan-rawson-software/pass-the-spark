# Art assets

This is the list of images the game can use, for generating art locally. The game draws everything in code today. When an image listed here exists and is in the manifest, the web game shows it instead. Otherwise it falls back to the code-drawn version (issue: "Show generated art where it exists"). The same files will carry over to the Godot version.

## Rules for every file

- **Where:** `public/art/<folder>/<id>.<ext>`. Folders and ids are listed below. Ids match the data files (`data/enemies.json`, `data/charms.json`, `data/events.json`), so a renamed enemy keeps its art.
- **Manifest:** `public/art/manifest.json` lists every file that exists, as paths relative to `public/art/`, for example `["enemies/ogre.png", "sparks/Ember.png"]`. The game loads only what's listed. Add each new file to it.
- **Formats:**
  - PNG with a transparent background for icons, portraits, tiles and map stops;
  - JPG (quality about 85) for backgrounds and event illustrations, which fill their whole frame.
- **Size budget:** icons under 100 KB, portraits and illustrations under 400 KB, backgrounds under 1 MB. Shrink or recompress anything bigger. The whole `public/art/` folder should stay under about 60 MB.
- **No text in images.** The game draws all names and numbers itself.
- **Generate big, ship small:** generate at the model's native size, then downscale to the sizes below. Leave about 8% padding inside the frame for icons, so outlines and glows aren't clipped.
- **Transparency:** most models can't make transparent images. Generate on a plain, flat background and remove it (for example with `rembg`), then check the edges.

## Style

The look is a placeholder until the designer sets one. Start from this and adjust it in this file:

- Hand-painted tabletop fantasy, warm lantern light, rich colour, clean readable silhouettes.
- Icons: a single centred object, bold dark outline, simple shading. They must read at 48 px.
- One consistent palette and lighting across a whole set. Generate a set with the same model, sampler, style words and negative prompt.
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

### Sparks: `sparks/<Spark>.png`, 256×256, transparent
`Ember`, `Tide`, `Gale`, `Storm`, `Void`, `Rot`. A glowing glyph in the spark's colour and shape. These sit on domino halves, so keep them simple.

### Effects: `effects/<kind>.png`, 256×256, transparent
`damage`, `block`, `heal`, `amplify`, `echo`, `lookout`, `mimic`, `reflect`. One clear symbol each (for example a blade, a shield, a heart, a rising arrow, ripples, an eye, a mirror mask, a reversing mirror).

### Traits and markers: `ui/<id>.png`, 128×128, transparent
`spectrum` (rainbow prism), `ignores_block` (arrow through a shield), `no_lap` (crossed-out loop), `locked` (padlock), `blessed` (halo or sun), `coin`, `health` (heart), `block` (small shield), `charm_normal` (round frame), `charm_rare` (gold diamond frame).

### Domino tiles: `tiles/<id>.png`, 480×240, transparent
`starter`, `common`, `uncommon`, `rare`, `enemy`, `hidden` (face-down back). An empty two-halved domino face with a divider line. The game draws the spark, effect icon and numbers on top, so leave the halves plain. Rarity can show in the frame (plain, silver, gold); enemy tiles look darker or menacing.

### Enemies: `enemies/<id>.png`, 512×512, transparent
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
| `warden` | elite | Armoured guard, a mirror shield (it Reflects) |
| `ravager` | elite | Feral, clawed |
| `sentinel` | elite | Tall armoured watcher |
| `tyrant` | elite | Crowned warlord on a throne |
| `warlord` | elite | Battle-hardened commander |
| `auditor` | boss | A ledger-keeper with quills and scales; punishes repeated sparks |
| `glutton` | boss | Enormous, always eating; heals when the lap goes up |
| `hoarder` | boss | Hunched on a pile of shields and treasure; gains block |
| `smolder` | boss | A smouldering coal beast, embers leaking from cracks |
| `long_night` | boss | A moon-faced shadow; grows stronger each lap |
| `warden_of_locks` | boss | A jailer covered in padlocks and chains |

Most normal enemy and elite names are placeholders. Keep the ids, and design freely.

### Events: `events/<id>.jpg`, 800×1000, full frame
`toll_bridge`, `tinkers_bench`, `wishing_well`, `sleeping_giant`, `spark_shrine`, `lost_courier`, `mirror_pond`, `twin_forge`. Scene illustrations, shown on the left of the event screen. The game crops to fit, so keep the subject centred.

### Charms: `charms/<id>.png`, 256×256, transparent
Normal: `ember_lens`, `tide_lens`, `gale_lens`, `deep_pockets`, `early_riser`, `spark_starter`, `spyglass`, `bulwark`, `resonance`, `lap_runner`, `coin_purse`, `haggler`.
Rare: `prism`, `overcharge`, `first_echo`, `keystone`, `hall_of_mirrors`, `lightning_rod`.
One trinket each (a lens in the spark's colour, a deep pouch, a rooster or sunrise, a striking flint, a spyglass, a tower shield, a tuning fork, running boots, a coin purse, a merchant's scale; rare: a prism, a crackling battery or crystal, a double bell, an arch keystone, a mirror maze, a lightning rod). Rare charms look more precious, with gold and a glow.

### Map stops: `map/<type>.png`, 192×192, transparent
`fight` (crossed swords), `elite` (horned skull), `boss` (crown), `rest` (campfire), `trader` (merchant's tent), `event` (question-mark sign or mystery door), `hidden` (fog or cloud).

### Backgrounds: `backgrounds/<id>.jpg`, 1920×1080
`combat` (a wooden table in a lantern-lit tavern, seen from above at an angle; the middle stays calm so dominoes read clearly), `map` (an old parchment map texture), `title` (a moody tavern scene), `rest` (a campfire at night), `trader` (a market stall), `act_transition` (a road at dusk). Keep backgrounds low in contrast so the game drawn on top stays readable.

## Order of work

1. A style test: 2 sparks, 2 effects, 1 enemy and 1 charm. The designer approves the look before anything else.
2. Sparks, effects, tiles and the `ui` markers. They appear on every screen.
3. Enemies (bosses first), then charms, then map stops.
4. Events and backgrounds.
