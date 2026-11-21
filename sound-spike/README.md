# Sound spike (#244) and sound picker rounds (#251)

This branch never merges. Open `picker.html` in a browser to listen.

- `round3.html`: round 3 (#277), the 0.2 cues `combo:line` and `enemy:stagger`; files in `round3/`, with `round3/candidates.json`. Its mix buttons play each candidate with the cues it shares the moment with.
- `picker.html`: round 2 (#252), the menu and run cues; files in `round2/`.
- `round1.html`: round 1 (#251), every combat cue, two candidates each, made with the recipes in `tools/sound/` on `main`. Files are in `round1/`, with `round1/candidates.json` (what each one is made of).
- `spike.html`: the original spike (#244). `<method>/<cue>_<n>.ogg` are its candidates and `tools/` its build script. The report is `docs/sound-spike.md` on `main`.

Every clip is matched to -14 LUFS (loudest 400 ms window), with peaks under -1.5 dBFS.
