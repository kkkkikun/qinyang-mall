"""Stage: product candidate clustering (docs/p1.md §4, part B).

Product grouping evidence, in order of weight:
  1. Source folder structure  - the client curated one folder per product
                               (40 pieces in the 04.21 library, 36 in 09.21).
  2. CLIP embedding similarity - splits a folder that actually contains two
                               different items, and links the same item shot
                               in two different folders.
  3. Perceptual hash similarity - confirms "same photo re-compressed".

Everything the algorithm is unsure about is written to uncertain_groups.csv
with review_status = needs_manual_review instead of being forced into a group.
"""
from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C


def load_embeddings() -> tuple[dict[str, np.ndarray], np.ndarray]:
    p = C.CACHE_DIR / "embeddings.npz"
    if not p.exists():
        return {}, None
    z = np.load(p, allow_pickle=True)
    paths = [str(x) for x in z["paths"]]
    vecs = z["vecs"].astype("float32")
    return dict(zip(paths, vecs)), vecs


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b))


def main() -> int:
    with C.Stage("06_cluster") as stage:
        C.ensure_dirs()
        inv = C.load_cache("inventory.json")
        labels = C.load_cache("labels.json")
        emb, _ = load_embeddings()
        stage.log(f"images={len(inv)} embeddings={len(emb)}")

        # ---------- 1. folder level candidates ----------
        folders: dict[str, list[str]] = defaultdict(list)
        for key, rec in inv.items():
            lib = rec.get("library", "")
            fol = rec.get("source_folder", "")
            folders[f"{lib}/{fol}"].append(key)

        # The client numbered the product folders 1..N; the root level
        # "未命名文件夹" of each library is product #1 (its own shoot folder),
        # so it is numbered rather than treated as loose material.
        def folder_number(fol: str):
            if fol.replace("未命名文件夹", "").strip() == "":
                return 1
            try:
                return int(fol.replace("未命名文件夹", "").strip())
            except ValueError:
                return 999

        numbered = {f: v for f, v in folders.items() if folder_number(f.split("/", 1)[1]) != 999}
        loose = {f: v for f, v in folders.items() if f not in numbered}

        def folder_sort_key(f: str):
            lib, fol = f.split("/", 1)
            return (lib, folder_number(fol), fol)

        # ---------- 2. split a folder if it holds >1 product ----------
        splits: dict[str, list[list[str]]] = {}
        for f, members in sorted(numbered.items(), key=lambda kv: folder_sort_key(kv[0])):
            splits[f] = split_folder(f, members, emb, labels, inv, stage)

        # ---------- 3. build candidate products ----------
        products: list[dict] = []
        idx = 0
        for f, subclusters in sorted(splits.items(), key=lambda kv: folder_sort_key(kv[0])):
            lib, fol = f.split("/", 1)
            for ci, members in enumerate(subclusters):
                idx += 1
                products.append(
                    {
                        "product_id": f"ED-{idx:04d}",
                        "source_group": f,
                        "library": lib,
                        "source_folder": fol,
                        "client_product_number": folder_number(fol),
                        "cluster_index": ci,
                        "members": sorted(members),
                        "group_confidence": 0.9 if ci == 0 else 0.7,
                        "review_status": "auto_grouped",
                    }
                )

        # loose files (not inside a numbered product folder)
        for f, members in sorted(loose.items()):
            idx += 1
            products.append(
                {
                    "product_id": f"ED-{idx:04d}",
                    "source_group": f,
                    "library": f.split("/", 1)[0],
                    "source_folder": f.split("/", 1)[1],
                    "cluster_index": 0,
                    "members": sorted(members),
                    "group_confidence": 0.4,
                    "review_status": "needs_manual_review",
                }
            )

        # ---------- 4. cross-folder relations (same item shot twice?) ----------
        relations = []
        by_lib: dict[str, list[dict]] = defaultdict(list)
        for p in products:
            by_lib[p["library"]].append(p)
        libs = sorted(by_lib)
        for i in range(len(libs)):
            for j in range(i + 1, len(libs)):
                for pa in by_lib[libs[i]]:
                    for pb in by_lib[libs[j]]:
                        best = cross_similarity(pa["members"], pb["members"], emb)
                        if best and best[0] >= 0.90:
                            relations.append(
                                {
                                    "product_a": pa["product_id"],
                                    "product_b": pb["product_id"],
                                    "similarity": round(best[0], 4),
                                    "evidence": "clip_embedding",
                                    "image_a": C.rel(best[1]),
                                    "image_b": C.rel(best[2]),
                                }
                            )
        stage.log(f"cross-library candidate relations: {len(relations)}")

        # ---------- 5. uncertainty report ----------
        uncertain_rows = []
        for p in products:
            cats = {labels.get(m, {}).get("category", "unknown") for m in p["members"]}
            confs = [labels.get(m, {}).get("confidence", 0.0) for m in p["members"]]
            reasons = []
            if len(cats) > 1 and "unknown" not in cats:
                reasons.append("同一文件夹内出现多个商品类别: " + ",".join(sorted(cats)))
            if "unknown" in cats:
                reasons.append("部分图片类别无法确定")
            if p["cluster_index"] > 0:
                reasons.append("从同一文件夹中拆分出的候选商品")
            if p["review_status"] == "needs_manual_review":
                reasons.append("图片未归属于编号商品文件夹（散图）")
            if confs and (sum(confs) / len(confs)) < 0.5:
                reasons.append("分类平均置信度偏低")
            if reasons:
                uncertain_rows.append(
                    {
                        "product_id": p["product_id"],
                        "source_group": p["source_group"],
                        "image_count": len(p["members"]),
                        "categories": ",".join(sorted(cats)),
                        "avg_confidence": round(sum(confs) / len(confs), 3) if confs else 0,
                        "group_confidence": p["group_confidence"],
                        "review_status": "needs_manual_review",
                        "reasons": " | ".join(reasons),
                        "members": "; ".join(C.rel(m) for m in p["members"][:12]),
                    }
                )
        for r in relations:
            uncertain_rows.append(
                {
                    "product_id": f"{r['product_a']} <-> {r['product_b']}",
                    "source_group": "cross-library",
                    "image_count": 2,
                    "categories": "",
                    "avg_confidence": r["similarity"],
                    "group_confidence": r["similarity"],
                    "review_status": "needs_manual_review",
                    "reasons": "两个分组之间存在高度相似图片，可能是同一商品，需人工确认是否合并",
                    "members": f"{r['image_a']} ; {r['image_b']}",
                }
            )
        # cross-library candidates produced by the dedicated colour/pHash check
        cross_csv = C.REPORTS_DIR / "cross_library_candidates.csv"
        if cross_csv.exists():
            with open(cross_csv, encoding="utf-8-sig") as fh:
                for row in csv.DictReader(fh):
                    uncertain_rows.append(
                        {
                            "product_id": f"{row['product_a']} <-> {row['product_b']}",
                            "source_group": row["type"],
                            "image_count": 2,
                            "categories": "",
                            "avg_confidence": row.get("confidence", ""),
                            "group_confidence": row.get("confidence", ""),
                            "review_status": "needs_manual_review",
                            "reasons": "跨图库相似候选（" + row["type"] + "），外观相近但可能是不同商品，需人工确认",
                            "members": f"{row.get('image_a','')} ; {row.get('image_b','')}",
                        }
                    )
        out = C.REPORTS_DIR / "uncertain_groups.csv"
        with open(out, "w", newline="", encoding="utf-8-sig") as fh:
            fields = [
                "product_id", "source_group", "image_count", "categories",
                "avg_confidence", "group_confidence", "review_status", "reasons", "members",
            ]
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(uncertain_rows)
        stage.log(f"wrote {out} ({len(uncertain_rows)} rows)")

        C.save_cache(
            "products.json",
            {
                "products": products,
                "relations": relations,
                "folder_map": {k: v for k, v in folders.items()},
            },
        )
        (C.CACHE_DIR / "products.json").write_text(
            json.dumps({"products": products, "relations": relations}, ensure_ascii=False, indent=1),
            "utf-8",
        )
        stage.log(f"DONE products={len(products)} uncertain={len(uncertain_rows)}")
    return 0


def split_folder(f, members, emb, labels, inv, stage) -> list[list[str]]:
    """Split one source folder into one or more product candidates."""
    if len(members) <= 2 or not emb:
        return [sorted(members)]
    embs = [emb[m] for m in members if m in emb]
    if len(embs) < len(members):
        return [sorted(members)]
    mat = np.stack(embs)
    sim = mat @ mat.T
    n = len(members)
    adj = [[False] * n for _ in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            if sim[i, j] >= 0.88:
                adj[i][j] = adj[j][i] = True
    # connected components
    comp: list[list[int]] = []
    seen = [False] * n
    for i in range(n):
        if seen[i]:
            continue
        stack, cur = [i], []
        seen[i] = True
        while stack:
            x = stack.pop()
            cur.append(x)
            for y in range(n):
                if adj[x][y] and not seen[y]:
                    seen[y] = True
                    stack.append(y)
        comp.append(sorted(cur))
    if len(comp) == 1:
        return [sorted(members)]
    comp.sort(key=len, reverse=True)
    stage.log(f"  split {f} into {len(comp)} clusters: {[len(c) for c in comp]}")
    return [[members[i] for i in c] for c in comp]


def cross_similarity(a_members, b_members, emb, top: int = 60):
    if not emb:
        return None
    a = [emb[m] for m in a_members if m in emb][:top]
    b = [emb[m] for m in b_members if m in emb][:top]
    if not a or not b:
        return None
    A = np.stack(a)
    B = np.stack(b)
    s = A @ B.T
    idx = np.unravel_index(np.argmax(s), s.shape)
    return (float(s[idx]), a_members[idx[0]], b_members[idx[1]])


if __name__ == "__main__":
    raise SystemExit(main())
