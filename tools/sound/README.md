# Sound recipes

Every sound in `public/audio/sfx/` is rendered from a recipe here, in the layered jsfxr style picked in the sound spike (`docs/sound-spike.md`). This folder is outside the game build.

## Setup (once)

- Node: `npm ci` installs `jsfxr` (a dev dependency).
- Python 3.11 or later: `pip install -r tools/sound/requirements.txt` (numpy, scipy, soundfile). A virtual environment is a good idea.

## Re-render

```
npm run sounds                                   # every cue -> public/audio/sfx/<cue>.ogg
python tools/sound/build.py --cue combo:hit      # one cue
python tools/sound/build.py --check              # the scale cues at their highest step
```

A cue's `:` becomes `-` in its file name (`combo:hit` -> `combo-hit.ogg`). The same recipes always render byte-identical files: jsfxr's noise is seeded and the Ogg stream serial is fixed.

## Tweak a recipe

1. Find the cue in `recipes.py`: its `@recipe("<cue>", "pick")` function.
2. Change it. A recipe stacks jsfxr voices with `voice(wave, frequency, **jsfxr parameters)` and places them with `mix((audio, offset seconds, gain dB), ...)`, then processes the result (`comp`, `shelf`, `softclip`, `reverb`, all in `sfx.py`). Envelope stages in seconds go through `sustain(seconds)`.
3. Run `python tools/sound/build.py --cue <cue>` and listen to `public/audio/sfx/<cue>.ogg`.

Rules that keep the set consistent:

- **Pitched cues sit in C major pentatonic.** Put the root on a C. The game pitches cues with a `scale` in `data/sound.json` up that scale, to at most `maxStep`. Run `--check` afterwards: each one should still have a clear body at its top step.
- **Loudness is matched for you.** `build.py` brings every clip to -14 LUFS (loudest 400 ms window), with peaks under -1.5 dBFS. The gains inside a recipe only balance its layers. How loud a cue plays in the game is its `volume` in `data/sound.json`.
- **Noise layers take a `seed`.** Change it to get a different grain.

## New cues and picker rounds

Add `"A"` and `"B"` variants of a cue next to each other (or next to its `"pick"`), then render them all for the picker:

```
python tools/sound/build.py --candidates <folder>
```

That writes `<cue>_<variant>.ogg` and `candidates.json` (each variant's description and its group from `GROUPS`) for `sound-spike/picker.html` on the `sound-spike` branch. When the designer picks, rename the chosen variant to `"pick"`, delete the other, and re-render.

## Files

- `build.py`: the command line, the loudness match and the Ogg writer.
- `recipes.py`: one recipe per cue.
- `sfx.py`: jsfxr voices, layering, effects and the loudness meter (ITU-R BS.1770 K-weighting).
- `render.mjs`: runs jsfxr for `sfx.py`, with its random numbers seeded.
