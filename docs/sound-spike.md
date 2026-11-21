# Sound spike (#244)

Which way of making sounds should the game use? This spike tried each method on four cues: `combo:hit`, `combo:tier3`, `combo:slam` and `combo:fanfareLethal`. Decisions S1–S3 set the scope: it picks a method and doesn't change any game sound.

**Listen:** open `sound-spike/picker.html` from the `sound-spike` branch, which never merges. It plays every candidate, runs `combo:hit` 8 or 15 times up the scale, and plays it 12 semitones up. It also has a blind mode. Each candidate's processing steps and sources are listed under it and in `sound-spike/candidates.json`.

## How the candidates were made

- **Loudness:** every candidate, and the current game clip for comparison, is matched to −14 LUFS over its loudest 400 ms window (ITU-R BS.1770 K-weighting). Peaks are soft-limited to −1.5 dBFS, so the loudest clip doesn't win by default. All 28 files land within 0.6 dB of the target.
- **Processing:** layering, EQ, compression, saturation and a simple convolution reverb, all done in `sound-spike/tools/build.py`. Every step is written down per file.
- **`combo:hit` pitched up:** the game pitches the hit by detune, which changes speed and pitch together, up to step 14 of the major pentatonic scale. That's +33 semitones. Each hit was checked at +12 and +33 for length, brightness and clicks (`tools/hitcheck.py`). Hits shorter than about 200 ms shrink to under 30 ms at the top of the run and lose their body, so both jsfxr hits were lengthened. Library hit 1 turns thin and very bright at the top, with its spectral centroid near 14 kHz.
- **Quality opinions below** are based on measurements and on how each clip was built. The session couldn't listen, so the designer's picks in the picker decide.

## 1. Local AI model: Stable Audio Open

**Not tested.** The model is gated: you need a Hugging Face account and must accept the licence before downloading the weights (about 5 GB). That sign-up was skipped this session.

| | |
| --- | --- |
| Quality | Not heard. It suits textures (whooshes, impacts, ambience) better than tuned musical cues. Pitch and timing are hard to control, so the hit and fanfare would need a lot of rerolling. |
| Time per sound | Seconds to render on the local GPU (an RTX 4060 Ti). Expect many rerolls per keeper, plus trimming. |
| Cost | Free. |
| Commercial licence | Stability AI Community License (confirm on the model card before use): free for commercial use under US $1M annual revenue; above that you need an enterprise licence. Its training data was CC-licensed (Freesound, Free Music Archive). |
| Works in Godot | Yes (export as .ogg or .wav). |
| To try it | Accept the licence at huggingface.co/stabilityai/stable-audio-open-1.0, then make a read token. ComfyUI runs the model natively. |

## 2. Curated free libraries (CC0)

Freesound needs an API key and the Sonniss GDC bundles are 20–30 GB behind a site that blocks scripts, so both were skipped. This round used CC0 packs from OpenGameArt and the Kenney packs instead.

| | |
| --- | --- |
| Quality | Mixed. The slams have real weight (a synthesized explosion, a muffled distant explosion, a gong tail, layered with Kenney punches). The fanfares are ready-made jingles, so they don't sit on the game's scale or key. The hits are generic, and hit 1 gets harsh pitched up. |
| Time per sound | About 4 minutes each: search, shortlist by name and length, trim, layer. Most of the time goes on searching. A big, well-tagged library (Sonniss, Freesound) would be faster per sound. |
| Cost | Free. |
| Commercial licence | All CC0: commercial use, no attribution needed. Sonniss GDC is royalty-free for commercial use with no attribution, but it can't be redistributed raw. Freesound mixes licences, so filter to CC0. |
| Works in Godot | Yes. |

Sources used (all CC0):

| Candidate | Clips |
| --- | --- |
| `library/combo-hit_1` | `hit_01.ogg` from [100 CC0 SFX](https://opengameart.org/content/100-cc0-sfx) (rubberduck) |
| `library/combo-hit_2` | `retro_coin_02.ogg` from [50 CC0 retro / synth SFX](https://opengameart.org/content/50-cc0-retro-synth-sfx) (rubberduck); `impactGeneric_light_000.ogg` from [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) |
| `library/combo-hit_3` | `sd_0.wav` from [Point bell](https://opengameart.org/content/point-bell) (haeldb, dual CC0/OGA-BY, used under CC0); `impactPunch_medium_000.ogg` from Kenney Impact Sounds |
| `library/combo-tier3_1` | `power_up_04.ogg` from 50 CC0 retro / synth SFX |
| `library/combo-tier3_2` | `Rise06.aif` from [Level up, power up, Coin get](https://opengameart.org/content/level-up-power-up-coin-get-13-sounds) (wobbleboxx) |
| `library/combo-tier3_3` | `power_up_01.ogg` from 50 CC0 retro / synth SFX; `bell_02.ogg` from 100 CC0 SFX |
| `library/combo-slam_1` | `synthetic_explosion_1.flac` from [Synthesized explosion](https://opengameart.org/content/synthesized-explosion) (qubodup); `impactPunch_heavy_002.ogg` from Kenney Impact Sounds |
| `library/combo-slam_2` | `muffled.wav` from [Muffled Distant Explosion](https://opengameart.org/content/muffled-distant-explosion) (NenadSimic); `impactMining_004.ogg` from Kenney Impact Sounds; `slam_03.ogg` from 100 CC0 SFX |
| `library/combo-slam_3` | `retro_explosion_05.ogg` from 50 CC0 retro / synth SFX; `gong_01.ogg` from 100 CC0 SFX; `impactPunch_heavy_000.ogg` from Kenney Impact Sounds |
| `library/combo-fanfareLethal_1` | `life.wav` from [8bit fanfare jingle "The Lick"](https://opengameart.org/content/8bit-fanfare-jingle-the-lick) (haley-halcyon) |
| `library/combo-fanfareLethal_2` | `fanfare_3.ogg` from [Classic fanfare lick](https://opengameart.org/content/classic-fanfare-lick) (fvcalderan) |
| `library/combo-fanfareLethal_3` | `win-176035.mp3` from [Victory](https://opengameart.org/content/victory-6) (musheran); `bell_03.ogg` from 100 CC0 SFX |

## 3. Sound-effect generator: jsfxr

jsfxr 1.4.1 from npm, run headless. Every sound was designed by hand rather than with the random buttons, and is built from several jsfxr layers. The pitched parts are placed exactly on the game's scale. Chords, runs and sparkles are layered jsfxr notes, because jsfxr itself only makes one voice.

| | |
| --- | --- |
| Quality | Strong on the pitched, arcade cues. The hits are tuned to C6, stay punchy pitched up, and a run of them sounds like a melody. Stingers and fanfares can use the game's own scale and key. Slams are noise plus a sub drop: big after saturation and reverb, but retro rather than cinematic. The whole set sounds consistent. |
| Time per sound | About 5 minutes each by hand, then instant to re-render. Once a recipe exists, variants (tiers 1–4, fanfares 0–3) are a one-line change. |
| Cost | Free. |
| Commercial licence | jsfxr is under the Unlicense (public domain), and its output belongs to us. No attribution needed. |
| Works in Godot | Yes (.ogg). The recipes are plain parameter lists, so they could even run in GDScript later. |

## 4. Hosted paid AI: ElevenLabs sound effects

**Not tested.** It needs an account, and that sign-up was skipped. Nothing was bought.

| | |
| --- | --- |
| Quality | Not heard. Its text-to-SFX is usually the strongest of the hosted tools for realistic impacts and whooshes. Like Stable Audio, it can't hit exact pitches. |
| Time per sound | Seconds per render, several rerolls per keeper. |
| Cost | Free tier: a small monthly credit allowance, about a dozen clips. Commercial use needs a paid plan, which starts at a few dollars a month (check current pricing). |
| Commercial licence | The free tier is non-commercial and needs attribution. Paid plans grant commercial rights. |
| Works in Godot | Yes (download as .mp3 or .wav, convert to .ogg). |

## Recommendation (provisional, until the designer picks)

Use **a mix, led by tuned synthesis**:

1. **jsfxr-style layered synthesis for every pitched or musical cue:** `combo:hit`, `combo:block`, coin, tier stingers and fanfares. These cues are played on the game's scale and climb with the combo. Only synthesis puts them exactly in tune, keeps them short and punchy when pitched up, and makes the tier and fanfare variants consistent and cheap.
2. **CC0 library layers for weight:** slams, the lethal slam, shield breaks and enemy deaths. Layer a real impact or explosion under a synth body. The best library slams here already do this, and a real recording adds weight that a noise generator lacks.
3. **Local AI (Stable Audio Open) as a later experiment**, only for textures such as whooshes, charge-ups and ambience. Do it if the designer wants a less retro sound and is willing to accept the model's licence.
4. **Don't buy ElevenLabs** unless an untested comparison later shows it clearly wins (S2). Nothing heard here needs it.

## Designer's picks

_To be filled in after listening in the picker._
