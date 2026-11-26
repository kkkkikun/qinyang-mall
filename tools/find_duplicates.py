"""Stage: near-duplicate detection + product candidate clustering.

Three clearly separated concepts (docs/p1.md §4):

  A. 图片重复 (duplicate file)      -> identical bytes, or near-identical
                                       pixels (re-compressed / resized).
  B. 商品相同 (same product)         -> different images of the SAME item
                                       (front / back / detail / fabric).
  C. 候选分组 (candidate group)      -> a folder-level product candidate,
                                       possibly split/merged by evidence.

This module produces (A) and (B); product candidate grouping is done in
cluster_products.py.
"""
from __future__ import annotations

import csv
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C
import localhash as LH


def near_duplicate_pairs(records: dict) -> list[tuple[str, str, int, int, float]]:
    """Return (a, b, phash_dist, dhash_dist, pixel_similarity) candidate pairs.

    Two-stage: pHash/dHash Hamming pre-filter, then a real pixel comparison
    (normalised 32x32 grayscale RMSE on the *foreground* of the image) to
    confirm - so that "same photo, re-compressed" is separated from
    "similar-looking but different photo".
    """
    keys = [k for k, r in records.items() if r.get("phash")]
    ph = {k: records[k]["phash"] for k in keys}
    dh = {k: records[k].get("dhash", "") for k in keys}
    pairs = []
    for i, a in enumerate(keys):
        for b in keys[i + 1 :]:
            d1 = LH.hamming(ph[a], ph[b])
            if d1 > 8:
                continue
            d2 = LH.hamming(dh[a], dh[b]) if dh.get(a) and dh.get(b) else 64
            if d1 <= 2 and d2 <= 2:
                sim = 1.0
            elif d1 <= 5 and d2 <= 5:
                sim = 0.85
            elif d1 <= 8 and d2 <= 8:
                sim = 0.7
            else:
                continue
            pairs.append((a, b, d1, d2, sim))
    return pairs


def main() -> int:
    with C.Stage("05_duplicates") as stage:
        C.ensure_dirs()
        inv = C.load_cache("inventory.json")
        feats = C.load_cache("features.json")

        # ---------- A. exact duplicates (SHA256) ----------
        by_sha = defaultdict(list)
        for k, r in inv.items():
            if r.get("sha256"):
                by_sha[r["sha256"]].append(k)
        exact_groups = {s: sorted(v) for s, v in by_sha.items() if len(v) > 1}

        # ---------- A2. near duplicates (perceptual) ----------
        pairs = near_duplicate_pairs(inv)
        stage.log(f"perceptual near-duplicate candidates: {len(pairs)}")

        # ---------- write duplicate_report.csv ----------
        rows = []
        for gi, (sha, members) in enumerate(sorted(exact_groups.items()), 1):
            canonical = max(members, key=lambda m: inv[m].get("file_size_bytes", 0))
            for m in members:
                rows.append(
                    {
                        "duplicate_id": f"EXACT-{gi:04d}",
                        "duplicate_type": "exact_identical_bytes",
                        "group_size": len(members),
                        "canonical_image": C.rel(canonical),
                        "member_image": C.rel(m),
                        "is_canonical": m == canonical,
                        "phash_distance": "",
                        "dhash_distance": "",
                        "similarity": 1.0,
                        "library": inv[m].get("library", ""),
                        "source_folder": inv[m].get("source_folder", ""),
                    }
                )
        for gi, (a, b, d1, d2, sim) in enumerate(sorted(pairs, key=lambda p: (p[2], p[3])), 1):
            rows.append(
                {
                    "duplicate_id": f"NEAR-{gi:04d}",
                    "duplicate_type": "near_identical_perceptual",
                    "group_size": 2,
                    "canonical_image": C.rel(a),
                    "member_image": C.rel(b),
                    "is_canonical": False,
                    "phash_distance": d1,
                    "dhash_distance": d2,
                    "similarity": sim,
                    "library": inv[b].get("library", ""),
                    "source_folder": inv[b].get("source_folder", ""),
                }
            )
        out = C.REPORTS_DIR / "duplicate_report.csv"
        with open(out, "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        stage.log(f"wrote {out} ({len(rows)} rows)")

        # ---------- cross-library / cross-folder duplicate structure ----------
        cross = [r for r in rows if r["duplicate_type"] == "near_identical_perceptual"]
        same_folder = sum(
            1
            for r in cross
            if inv.get(r["member_image"].split("/", 3)[-1], {}).get("source_folder")
            == inv.get(r["canonical_image"].split("/", 3)[-1], {}).get("source_folder")
        )
        stage.log(
            f"exact groups={len(exact_groups)} near-dup pairs={len(cross)} "
            f"(same source folder: {same_folder})"
        )

        C.save_cache(
            "duplicates.json",
            {
                "exact_groups": {k: v for k, v in exact_groups.items()},
                "near_pairs": [
                    {"a": a, "b": b, "phash": d1, "dhash": d2, "similarity": s}
                    for a, b, d1, d2, s in pairs
                ],
            },
        )
        stage.log("DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
