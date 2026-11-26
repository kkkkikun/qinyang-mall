"""Build one contact sheet per product candidate, for visual review.

These sheets are the input to the human review pass: each tile carries its
file name so the reviewer can write explicit per-image overrides.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C

COLS = 4
CELL_W = 360
LABEL_H = 26


def main() -> int:
    with C.Stage("10_review_sheets") as stage:
        C.ensure_dirs()
        prods = C.load_cache("products.json")
        if not prods:
            stage.log("run tools/cluster_products.py first")
            return 2
        out_dir = C.CATALOG_DIR / "review" / "product_sheets"
        out_dir.mkdir(parents=True, exist_ok=True)

        for p in prods["products"]:
            members = p["members"]
            if not members:
                continue
            cols = COLS
            rows = (len(members) + cols - 1) // cols
            cell_h = int(CELL_W * 1.25)
            sheet = Image.new("RGB", (cols * CELL_W, rows * (cell_h + LABEL_H)), (250, 247, 241))
            draw = ImageDraw.Draw(sheet)
            for i, key in enumerate(sorted(members)):
                x = (i % cols) * CELL_W
                y = (i // cols) * (cell_h + LABEL_H)
                try:
                    with Image.open(C.PROJECT_ROOT / key) as im:
                        im = im.convert("RGB")
                        im.thumbnail((CELL_W - 10, cell_h - 10), Image.LANCZOS)
                        sheet.paste(im, (x + (CELL_W - im.width) // 2, y + (cell_h - im.height) // 2))
                except Exception:  # noqa: BLE001
                    draw.rectangle([x + 8, y + 8, x + CELL_W - 8, y + cell_h - 8], outline=(200, 190, 175))
                draw.text((x + 6, y + cell_h + 6), Path(key).name[:28], fill=(122, 92, 66))
                draw.rectangle([x, y, x + CELL_W - 1, y + cell_h + LABEL_H - 1], outline=(228, 220, 208))
            out = out_dir / f"{p['product_id']}.jpg"
            sheet.save(out, "JPEG", quality=84, optimize=True)
        stage.log(f"wrote {len(prods['products'])} sheets to {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
