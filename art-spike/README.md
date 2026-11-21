# Art spike (#259)

This branch never merges. Open `picker.html` in a browser (straight from disk is fine).

- `picker.html`: every method's test set at ×4 over the combat background, with seat colours, hat and robe swapping and the animations.
- `ai/`: method 1, SDXL + pixel-art-xl drafts cleaned onto the grid (`cleanup.py`; prompts and seeds in `prompts.jsonl`, contact sheets of the drafts in `drafts/`).
- `code/`: method 2, layered pixel data drawn by `make.py` (round 1; its circle was picked).
- `code2/`: wizard round 2, storybook and chibi styles at 48×64, drawn by `make.py`.
- `packs/`: method 3, the CC0 Teleport circle (gfroad, OpenGameArt) adapted by `make.py`. Other packs are only linked from the picker.
- `tools/pix.py`: the shared 23-colour palette and pixel checks; `tools/bundle.py` rebuilds `sheets.js` after any PNG changes.

The report is `docs/art-spike.md` on `main`.
- `wizards.html` and `code3/`: #261 step 1, three wizard styles between storybook and chibi (`code3/make.py`).
