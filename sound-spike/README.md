# Sound spike (#244) and sound picker rounds (#251)

This branch never merges. Open `picker.html` in a browser to listen.

- `picker.html`: round 1 (#251), every combat cue, two candidates each, made with the recipes in `tools/sound/` on `main`. Files are in `round1/`, with `round1/candidates.json` (what each one is made of).
- `spike.html`: the original spike (#244). `<method>/<cue>_<n>.ogg` are its candidates and `tools/` its build script. The report is `docs/sound-spike.md` on `main`.

Every clip is matched to -14 LUFS (loudest 400 ms window), with peaks under -1.5 dBFS.
