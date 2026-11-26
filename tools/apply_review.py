"""Merge visual-review annotations into catalog/review/authored_overrides.json.

Usage:  python3 tools/apply_review.py <payload.json>

Payload format (product scoped):
{
  "ED-0001": {
    "category": "scarves",
    "color": "浅蓝色",
    "note": "印花长巾围巾",
    "images": {"DSC02934.jpg": "front", "DSC02937.jpg": "fabric"}
  }
}
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C

TARGET = C.CATALOG_DIR / "review" / "authored_overrides.json"


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    payload = json.loads(Path(sys.argv[1]).read_text("utf-8"))
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    data = {}
    if TARGET.exists():
        data = json.loads(TARGET.read_text("utf-8"))
    for pid, entry in payload.items():
        cur = data.get(pid, {})
        if "images" in entry:
            cur.setdefault("images", {})
            cur["images"].update(entry["images"])
            for k, v in entry.items():
                if k != "images":
                    cur[k] = v
        else:
            cur.update(entry)
        data[pid] = cur
    TARGET.write_text(json.dumps(data, ensure_ascii=False, indent=1), "utf-8")
    n_img = sum(len(v.get("images", {})) for v in data.values())
    print(f"merged {len(payload)} products -> {TARGET} (products={len(data)}, image labels={n_img})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
