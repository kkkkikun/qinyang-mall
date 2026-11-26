"""Rename derivative files from source-stem names to stable IMG-xxxx names.

The image_id (IMG-0001 ...) is the identifier used by every report and by the
mini-program data layer, so the derivative files must carry the same name.
Files are moved, never re-encoded, and the operation is idempotent.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C


def main() -> int:
    with C.Stage("07b_rename") as stage:
        inv = C.load_cache("inventory.json")
        prods = C.load_cache("products.json")
        member_of = {}
        for p in prods.get("products", []):
            for m in p["members"]:
                member_of[m] = p["product_id"]

        moved = 0
        missing = 0
        for key, rec in inv.items():
            img_id = rec.get("image_id")
            if not img_id:
                stage.log(f"no image_id for {key}")
                missing += 1
                continue
            pid = member_of.get(key)
            if not pid:
                continue
            base = C.CATALOG_DIR / "products" / pid
            stem = Path(key).stem
            for sub, suffix in (("processed", ""), ("thumbnails", ""),
                                ("display", "_1x1"), ("display", "_4x5")):
                old = base / sub / f"{stem}{suffix}.jpg"
                new = base / sub / f"{img_id}{suffix}.jpg"
                if old.exists() and not new.exists():
                    old.rename(new)
                    moved += 1
        stage.log(f"renamed {moved} derivative files (missing image_id: {missing})")
        C.save_cache("inventory.json", inv)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
