"""Cross-library similarity check (no ML required).

The two client libraries (04.21 / 09.21) were shot in different sessions, so a
product may appear in both. This stage looks for cross-library candidates using
  * perceptual hash distance (already computed), and
  * colour-histogram similarity from the CV features.

Candidates are never auto-merged: they are written to uncertain_groups.csv for
human confirmation, as required by docs/p1.md.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C
import localhash as LH


def hist_from_palette(palette) -> np.ndarray:
    """Small colour histogram built from the dominant palette."""
    h = np.zeros(8, dtype=np.float64)
    for c in palette:
        r, g, b = int(c["hex"][1:3], 16), int(c["hex"][3:5], 16), int(c["hex"][5:7], 16)
        h[min(7, r // 32)] += c["share"]
        h[min(7, g // 32)] += c["share"]
        h[min(7, b // 32)] += c["share"]
    total = h.sum() or 1.0
    return h / total


def main() -> int:
    with C.Stage("06b_crosslib") as stage:
        C.ensure_dirs()
        inv = C.load_cache("inventory.json")
        feats = C.load_cache("features.json")
        prods = C.load_cache("products.json")

        member_of = {}
        prod_of_img = {}
        for p in prods["products"]:
            for m in p["members"]:
                member_of[m] = p["product_id"]
                prod_of_img[m] = p

        lib_a = "04.21。 鄂多蘭   40件"
        lib_b = "09.21。 鄂多蘭   36件"
        A = [k for k in inv if inv[k].get("library") == lib_a]
        B = [k for k in inv if inv[k].get("library") == lib_b]

        # perceptual-hash cross-library pairs
        ph_pairs = []
        for a in A:
            for b in B:
                if not inv[a].get("phash") or not inv[b].get("phash"):
                    continue
                d = LH.hamming(inv[a]["phash"], inv[b]["phash"])
                if d <= 8:
                    ph_pairs.append((d, a, b))
        stage.log(f"cross-library perceptual-hash candidates: {len(ph_pairs)}")

        # product-level colour similarity
        prod_hist = {}
        for pid in {member_of[m] for m in member_of}:
            hs = []
            for m, p in member_of.items():
                if p != pid:
                    continue
                pal = feats.get(m, {}).get("palette")
                if pal:
                    hs.append(hist_from_palette(pal))
            if hs:
                prod_hist[pid] = np.mean(hs, axis=0)

        rows = []
        for d, a, b in sorted(ph_pairs):
            rows.append(
                {
                    "type": "cross_library_near_duplicate",
                    "product_a": member_of.get(a, ""),
                    "product_b": member_of.get(b, ""),
                    "image_a": C.rel(a),
                    "image_b": C.rel(b),
                    "phash_distance": d,
                    "colour_similarity": "",
                    "confidence": round(1 - d / 64, 3),
                }
            )

        # colour-only product candidates across libraries
        prodA = [p for p in prod_hist if p in {member_of[m] for m in A}]
        prodB = [p for p in prod_hist if p in {member_of[m] for m in B}]
        for pa in prodA:
            for pb in prodB:
                if pa == pb:
                    continue
                sim = float(np.minimum(prod_hist[pa], prod_hist[pb]).sum())
                if sim >= 0.82:
                    rows.append(
                        {
                            "type": "cross_library_colour_match",
                            "product_a": pa,
                            "product_b": pb,
                            "image_a": "",
                            "image_b": "",
                            "phash_distance": "",
                            "colour_similarity": round(sim, 3),
                            "confidence": round(sim, 3),
                        }
                    )
        stage.log(f"cross-library candidate rows: {len(rows)}")

        out = C.REPORTS_DIR / "cross_library_candidates.csv"
        with open(out, "w", newline="", encoding="utf-8-sig") as fh:
            fields = ["type", "product_a", "product_b", "image_a", "image_b",
                      "phash_distance", "colour_similarity", "confidence"]
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        stage.log(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
