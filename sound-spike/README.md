# Sound spike (#244)

This branch never merges. Open `picker.html` in a browser to listen; the report is `docs/sound-spike.md` on `main`.

- `<method>/<cue>_<n>.ogg`: candidates, loudness-matched to -14 LUFS (loudest 400 ms window), peaks under -1.5 dBFS. `current/` holds the clips the game plays today, matched the same way.
- `candidates.json`: every processing step and the source and licence of each library clip.
- `tools/`: `build.py` (layering, processing, loudness matching), `render.js` (jsfxr renderer), `hitcheck.py` (combo:hit pitched up), `picker_template.html`. The library clips themselves were downloaded to a scratch folder and are not committed; their links are in `candidates.json`.
