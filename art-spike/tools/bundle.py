"""Bundle every method's PNG sheets into sheets.js as data URIs, so picker.html can recolour them when
opened straight from disk (browsers won't let a page read pixels of file:// images).

  python art-spike/tools/bundle.py
"""
import base64
import json
from pathlib import Path

ROOT = Path(__file__).parent.parent
data = {str(p.relative_to(ROOT)).replace("\\", "/"): "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()
        for d in ("code", "ai", "packs", "code2/storybook", "code2/chibi", "code3/tall", "code3/balanced", "code3/cosy") for p in sorted((ROOT / d).glob("*.png"))}
(ROOT / "sheets.js").write_text("window.SHEETS = " + json.dumps(data) + ";\n")
print(len(data), "sheets")
