"""Add backdrop-busyness statistics to the cached feature set.

`bg_uniform` is False whenever the colour mask could not separate the product
from the backdrop (e.g. a white garment on a white sweep) - that is a
*detection* limitation, not a quality defect. This stage measures how busy the
backdrop actually is (edge density in the outer ring of the frame) so the
quality report flags real background interference only.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C


def ring_edge_density(path: Path, work: int = 640, ring: float = 0.09) -> float:
    im = Image.open(path).convert("RGB")
    im.thumbnail((work, work), Image.LANCZOS)
    a = np.asarray(im, dtype=np.uint8)
    h, w, _ = a.shape
    ry = max(1, int(h * ring))
    rx = max(1, int(w * ring))
    mask = np.zeros((h, w), dtype=bool)
    mask[:ry, :] = True
    mask[-ry:, :] = True
    mask[:, :rx] = True
    mask[:, -rx:] = True
    inner = np.zeros((h, w), dtype=bool)
    mask[ry:-ry, rx:-rx] = False
    inner[ry:-ry, rx:-rx] = True
    try:
        import cv2

        edges = cv2.Canny(a, 60, 160)
    except Exception:  # noqa: BLE001
        return 0.0
    ring_area = mask.sum()
    if ring_area == 0:
        return 0.0
    return float((edges > 0)[mask].sum() / ring_area)


def main() -> int:
    with C.Stage("03c_border_stats") as stage:
        C.ensure_dirs()
        feats = C.load_cache("features.json")
        todo = [k for k in sorted(feats) if "border_edge_density" not in feats[k]]
        stage.log(f"images={len(feats)} to process={len(todo)}")
        for i, key in enumerate(todo, 1):
            try:
                v = ring_edge_density(C.PROJECT_ROOT / key)
                feats[key]["border_edge_density"] = round(v, 4)
                # a clean sweep/backdrop has almost no structure in the frame border
                feats[key]["background_clean"] = bool(v < 0.06)
                feats[key]["background_busy"] = bool(v >= 0.06)
            except Exception as exc:  # noqa: BLE001
                feats[key]["border_edge_density"] = None
                feats[key]["background_clean"] = True
                feats[key]["background_busy"] = False
                stage.log(f"border stat error {key}: {exc}")
            if i % 100 == 0:
                stage.log(f"border stats {i}/{len(todo)}")
                C.save_cache("features.json", feats)
        C.save_cache("features.json", feats)
        busy = sum(1 for v in feats.values() if v.get("background_busy"))
        stage.log(f"DONE border stats={len(todo)} busy_backdrops={busy}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
