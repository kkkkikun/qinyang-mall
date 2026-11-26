"""Stage: build the standardized catalog (docs/p1.md §5, §6, §8).

Creates:
  catalog/products/<PID>/{original,processed,thumbnails,display}/
  catalog/categories/<category>/index.json
  catalog/ai-ready/{reference,approved}/
  catalog/reports/product_catalog.csv
  catalog/reports/image_manifest.json
  catalog/README.md

`original/` holds a pointer file (source_paths.txt) rather than a copy of the
source material, so the 10GB library is not duplicated - originals stay the
single source of truth inside images/.
"""
from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C

CATEGORY_ORDER = ["shirts", "scarves", "knitwear", "clothing", "accessories", "unknown"]
CATEGORY_CN = {
    "shirts": "衬衫",
    "scarves": "围巾",
    "knitwear": "针织服饰",
    "clothing": "其他服装",
    "accessories": "其他配饰",
    "unknown": "待人工确认",
}
ROLE_CN = {
    "cover": "商品主图",
    "front": "正面图",
    "back": "背面图",
    "side": "侧面图",
    "detail": "细节图",
    "fabric": "面料特写",
    "model": "模特展示图",
    "flatlay": "平铺图",
    "size_chart": "尺码图",
    "description": "详情说明图",
    "other": "其他",
}


def cover_score(feat: dict, lab: dict, rec: dict) -> float:
    """Cover suitability - completeness, sharpness, framing, background.

    Deliberately NOT "largest file wins".
    """
    score = 0.0
    role = lab.get("role")
    shot = lab.get("shot_type")

    # completeness of the garment in frame
    height_ratio = feat.get("subject_height_ratio") or 0.0
    score += min(30.0, height_ratio * 45.0)
    if feat.get("subject_complete"):
        score += 12.0
    if feat.get("touches_border", 0) >= 2:
        score -= 22.0

    # composition
    if feat.get("subject_centered"):
        score += 10.0
    area = feat.get("subject_area_ratio")
    if area is not None:
        # a product filling 25-70% of the frame reads best on mobile
        score += 12.0 * (1 - min(1.0, abs(area - 0.45) / 0.55))

    # technical quality
    score += min(16.0, (feat.get("sharpness") or 0) / 45.0)
    if feat.get("blurry"):
        score -= 25.0
    if feat.get("overexposed") or feat.get("underexposed"):
        score -= 15.0
    if feat.get("black_border"):
        score -= 8.0

    # background should not fight the product
    if feat.get("background_busy"):
        score -= 10.0
    else:
        score += 8.0

    # shot semantics
    if role in ("front", "cover"):
        score += 14.0
    elif role == "back":
        score += 2.0
    elif role == "flatlay":
        score += 6.0
    elif role in ("detail", "fabric"):
        score -= 12.0
    if shot == "styled_scene":
        score -= 4.0
    if feat.get("exif_rotate_needed"):
        score -= 6.0

    # resolution adequacy (small but usable is fine, tiny is not)
    long_edge = max(rec.get("width", 0), rec.get("height", 0))
    if long_edge >= 1500:
        score += 6.0
    elif long_edge >= 900:
        score += 3.0
    elif long_edge < 700:
        score -= 10.0
    return round(score, 2)


def temp_name(category: str, color: str, roles: set[str], note: str = "") -> str:
    """Temporary, descriptive product name - always marked as pending confirmation."""
    base = {
        "shirts": "衬衫",
        "scarves": "围巾",
        "knitwear": "针织服饰",
        "clothing": "服装",
        "accessories": "配饰",
        "unknown": "未分类商品",
    }.get(category, "商品")
    if note:
        # the note comes from the visual review and usually already carries the
        # colour word - avoid duplicating it in front of the name
        stem = color[:2] if color else ""
        name = note if (stem and stem in note) else f"{color}{note}" if color else note
    else:
        name = f"{color or '未知色'}{base}"
        if "model" in roles:
            name = "模特展示" + name
    return f"{name}（临时命名·待确认）"


def main() -> int:
    with C.Stage("08_catalog") as stage:
        C.ensure_dirs()
        inv = C.load_cache("inventory.json")
        feats = C.load_cache("features.json")
        labels = C.load_cache("labels.json")
        prods = C.load_cache("products.json")
        if not prods:
            stage.log("no products yet - run tools/cluster_products.py first")
            return 2

        review_notes: dict[str, str] = {}
        ov_path = C.CATALOG_DIR / "review" / "authored_overrides.json"
        if ov_path.exists():
            for pid, entry in json.loads(ov_path.read_text("utf-8")).items():
                if entry.get("note"):
                    review_notes[pid] = entry["note"]

        manifest_images: dict[str, dict] = {}
        product_rows: list[dict] = []
        ai_refs: list[dict] = []

        for p in prods["products"]:
            pid = p["product_id"]
            base = C.CATALOG_DIR / "products" / pid
            for sub in ("original", "processed", "thumbnails", "display"):
                (base / sub).mkdir(parents=True, exist_ok=True)

            members = [m for m in p["members"] if m in inv]
            if not members:
                continue

            scored = []
            roles_by_img: dict[str, str] = {}
            for m in members:
                lab = labels.get(m, {})
                f = feats.get(m, {})
                r = inv[m]
                roles_by_img[m] = lab.get("role", "other")
                scored.append((cover_score(f, lab, r), m))

            by_role: dict[str, list[tuple[float, str]]] = defaultdict(list)
            for s, m in scored:
                by_role[roles_by_img[m]].append((s, m))
            for v in by_role.values():
                v.sort(reverse=True)

            cover = by_role.get("front", []) or by_role.get("cover", []) or scored
            cover_item = max(scored, key=lambda t: t[0])
            # the cover must be a full-garment shot whenever one exists
            if by_role.get("front"):
                cover_item = max(by_role["front"], key=lambda t: t[0])
            cover_path = cover_item[1]
            roles_by_img[cover_path] = "cover"

            front = by_role.get("front", [])
            back = by_role.get("back", [])
            side = by_role.get("side", [])
            detail = by_role.get("detail", [])
            fabric = by_role.get("fabric", [])
            model = by_role.get("model", [])
            flatlay = by_role.get("flatlay", [])
            size_chart = by_role.get("size_chart", [])
            other = by_role.get("other", [])

            def relset(items, limit=None):
                out = [C.rel(m) for _, m in items]
                return out[:limit] if limit else out

            gallery = relset(front + back + side + flatlay + model + other)
            detail_list = relset(detail)
            fabric_list = relset(fabric)
            model_list = relset(model)

            # ---- category vote for the product ----
            votes: dict[str, float] = defaultdict(float)
            for m in members:
                lab = labels.get(m, {})
                cat = lab.get("category", "unknown")
                w = max(0.05, lab.get("confidence", 0.3))
                votes[cat] += w
            category = max(votes, key=votes.get) if votes else "unknown"
            if votes.get(category, 0) / max(1.0, sum(votes.values())) < 0.55:
                category = "unknown"

            # ---- colour vote ----
            cvotes: dict[str, float] = defaultdict(float)
            for m in members:
                lab = labels.get(m, {})
                cvotes[lab.get("visual_color", "未知色")] += 1
            visual_color = max(cvotes, key=cvotes.get) if cvotes else ""

            confs = [labels.get(m, {}).get("confidence", 0.0) for m in members]
            avg_conf = round(sum(confs) / len(confs), 3) if confs else 0.0
            group_conf = p.get("group_confidence", 0.5)
            confidence = round(0.5 * group_conf + 0.5 * avg_conf, 3)

            notes = []
            if category == "unknown":
                notes.append("商品类别未能确定，需人工确认")
            if not back:
                notes.append("缺少背面图")
            if not model_list:
                notes.append("缺少模特展示图")
            if not size_chart:
                notes.append("缺少尺码图")
            if p.get("cluster_index", 0) > 0:
                notes.append("该分组由同一源文件夹拆分而来，需确认")
            if p.get("review_status") == "needs_manual_review":
                notes.append("图片未归属于编号商品文件夹")
            if any(labels.get(m, {}).get("needs_review") for m in members):
                notes.append("部分图片识别置信度偏低")

            review_status = "auto_recognized"
            if p.get("review_status") == "needs_manual_review" or category == "unknown" or confidence < 0.55:
                review_status = "needs_manual_review"

            # ---- per product folder: original pointer file ----
            (base / "original" / "source_paths.txt").write_text(
                "\n".join(C.rel(m) for m in members) + "\n", "utf-8"
            )

            # ---- image manifest entries ----
            for m in members:
                lab = labels.get(m, {})
                f = feats.get(m, {})
                r = inv[m]
                img_id = r.get("image_id", "")
                manifest_images[img_id] = {
                    "imageId": img_id,
                    "productId": pid,
                    "sourcePath": C.rel(m),
                    "originalFile": Path(C.rel(m)).name,
                    "library": r.get("library", ""),
                    "sourceFolder": r.get("source_folder", ""),
                    "width": r.get("width", 0),
                    "height": r.get("height", 0),
                    "aspectRatio": round(r.get("width", 0) / max(1, r.get("height", 1)), 4),
                    "format": r.get("format", ""),
                    "fileSizeBytes": r.get("file_size_bytes", 0),
                    "hasAlpha": bool(r.get("has_alpha")),
                    "sha256": r.get("sha256", ""),
                    "phash": r.get("phash", ""),
                    "category": lab.get("category", "unknown"),
                    "categoryLabel": CATEGORY_CN.get(lab.get("category", "unknown"), "待人工确认"),
                    "role": roles_by_img.get(m, "other"),
                    "roleLabel": ROLE_CN.get(roles_by_img.get(m, "other"), "其他"),
                    "roleTags": lab.get("role_tags", []),
                    "shotType": lab.get("shot_type", ""),
                    "visualColor": lab.get("visual_color", ""),
                    "confidence": lab.get("confidence", 0.0),
                    "needsReview": bool(lab.get("needs_review")),
                    "isExactDuplicate": bool(r.get("is_exact_duplicate")),
                    "isLowResolution": bool(r.get("is_low_resolution")),
                    "quality": {
                        "sharpness": f.get("sharpness"),
                        "isBlurry": bool(f.get("blurry")),
                        "isOverexposed": bool(f.get("overexposed")),
                        "isUnderexposed": bool(f.get("underexposed")),
                        "hasBlackBorder": bool(f.get("black_border")),
                        "backgroundUniform": f.get("bg_uniform"),
                        "subjectComplete": f.get("subject_complete"),
                    },
                    "processed": C.rel(base / "processed" / f"{img_id}.jpg"),
                    "thumbnail": C.rel(base / "thumbnails" / f"{img_id}.jpg"),
                    "display": {
                        "1x1": C.rel(base / "display" / f"{img_id}_1x1.jpg"),
                        "4x5": C.rel(base / "display" / f"{img_id}_4x5.jpg"),
                    }
                    if roles_by_img.get(m) in ("cover", "front", "back", "side", "detail", "model", "flatlay", "other")
                    else None,
                }

            # ---- product_catalog.csv row ----
            row = {
                "product_id": pid,
                "product_name": temp_name(category, visual_color, {roles_by_img.get(m) for m in members},
                                          review_notes.get(pid, "")),
                "category": category,
                "category_label": CATEGORY_CN.get(category, "待人工确认"),
                "visual_color": visual_color,
                "material": "",
                "price": "",
                "stock": "",
                "sizes": "",
                "cover_image": C.rel(base / "processed" / f"{inv[cover_path].get('image_id', '')}.jpg"),
                "cover_source": C.rel(cover_path),
                "gallery_images": "|".join(gallery),
                "detail_images": "|".join(detail_list),
                "fabric_images": "|".join(fabric_list),
                "model_images": "|".join(model_list),
                "back_image": C.rel(back[0][1]) if back else "",
                "original_source": f"{p['library']}/{p['source_folder']}",
                "image_count": len(members),
                "confidence": confidence,
                "review_status": review_status,
                "notes": "; ".join(notes),
                "product_dir": C.rel(base),
            }
            product_rows.append(row)

            # ---- AI reference candidates ----
            ai_candidates = []
            for s, m in by_role.get("front", [])[:2]:
                ai_candidates.append(("front", m, s))
            for s, m in by_role.get("detail", [])[:2]:
                ai_candidates.append(("detail", m, s))
            for s, m in by_role.get("fabric", [])[:2]:
                ai_candidates.append(("fabric", m, s))
            for role, m, s in ai_candidates:
                f = feats.get(m, {})
                blockers = []
                if f.get("blurry"):
                    blockers.append("画面模糊")
                if f.get("overexposed") or f.get("underexposed"):
                    blockers.append("曝光异常")
                if f.get("touches_border", 0) >= 2:
                    blockers.append("主体贴边/可能被裁切")
                if max(inv[m].get("width", 0), inv[m].get("height", 0)) < 900:
                    blockers.append("分辨率偏低")
                ai_refs.append(
                    {
                        "product_id": pid,
                        "image_id": inv[m].get("image_id", ""),
                        "source_path": C.rel(m),
                        "candidate_role": role,
                        "score": s,
                        "blockers": blockers,
                    }
                )

        # ---- product_catalog.csv ----
        out = C.REPORTS_DIR / "product_catalog.csv"
        with open(out, "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.DictWriter(fh, fieldnames=list(product_rows[0].keys()))
            w.writeheader()
            w.writerows(product_rows)
        stage.log(f"wrote {out} ({len(product_rows)} products)")

        # ---- image_manifest.json ----
        manifest = {
            "schemaVersion": "1.0",
            "generatedAt": C.time.strftime("%Y-%m-%dT%H:%M:%S"),
            "project": "鄂多蘭 clothing mall miniapp",
            "sourceRoot": "images/",
            "catalogRoot": "catalog/",
            "taxonomy": {
                "categories": [{"id": c, "label": CATEGORY_CN[c]} for c in CATEGORY_ORDER],
                "roles": [{"id": r, "label": ROLE_CN[r]} for r in ROLE_CN],
            },
            "products": [
                {
                    "productId": r["product_id"],
                    "productName": r["product_name"],
                    "category": r["category"],
                    "categoryLabel": r["category_label"],
                    "visualColor": r["visual_color"],
                    "material": None,
                    "price": None,
                    "stock": None,
                    "sizes": None,
                    "coverImage": r["cover_image"],
                    "coverSource": r["cover_source"],
                    "galleryImages": r["gallery_images"].split("|") if r["gallery_images"] else [],
                    "detailImages": r["detail_images"].split("|") if r["detail_images"] else [],
                    "modelImages": r["model_images"].split("|") if r["model_images"] else [],
                    "originalSource": r["original_source"],
                    "confidence": r["confidence"],
                    "reviewStatus": r["review_status"],
                    "notes": r["notes"],
                    "productDir": r["product_dir"],
                    "imageIds": [
                        manifest_images[i]["imageId"]
                        for i in sorted(manifest_images)
                        if manifest_images[i]["productId"] == r["product_id"]
                    ],
                }
                for r in product_rows
            ],
            "images": [manifest_images[k] for k in sorted(manifest_images)],
        }
        out_json = C.REPORTS_DIR / "image_manifest.json"
        out_json.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8")
        stage.log(f"wrote {out_json} ({len(manifest['images'])} images)")

        # ---- categories index ----
        by_cat: dict[str, list[dict]] = defaultdict(list)
        for r in product_rows:
            by_cat[r["category"]].append(
                {
                    "product_id": r["product_id"],
                    "product_name": r["product_name"],
                    "cover_image": r["cover_image"],
                    "cover_source": r["cover_source"],
                    "image_count": r["image_count"],
                    "confidence": r["confidence"],
                    "review_status": r["review_status"],
                }
            )
        for cat in CATEGORY_ORDER:
            d = C.CATALOG_DIR / "categories" / cat
            d.mkdir(parents=True, exist_ok=True)
            (d / "index.json").write_text(
                json.dumps(
                    {
                        "category": cat,
                        "label": CATEGORY_CN[cat],
                        "productCount": len(by_cat.get(cat, [])),
                        "products": sorted(by_cat.get(cat, []), key=lambda x: x["product_id"]),
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                "utf-8",
            )
        stage.log("wrote categories indexes: " + ", ".join(f"{c}={len(by_cat.get(c, []))}" for c in CATEGORY_ORDER))

        # ---- ai-ready ----
        ref_dir = C.CATALOG_DIR / "ai-ready" / "reference"
        ref_dir.mkdir(parents=True, exist_ok=True)
        (ref_dir / "ai_reference_candidates.json").write_text(
            json.dumps({"generatedAt": manifest["generatedAt"], "candidates": ai_refs}, ensure_ascii=False, indent=2),
            "utf-8",
        )
        with open(ref_dir / "ai_reference_candidates.csv", "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.DictWriter(fh, fieldnames=["product_id", "image_id", "source_path", "candidate_role", "score", "blockers"])
            w.writeheader()
            for r in ai_refs:
                r = dict(r)
                r["blockers"] = "; ".join(r["blockers"])
                w.writerow(r)
        stage.log(f"wrote ai-ready reference index ({len(ai_refs)} candidates)")

        C.save_cache("catalog_rows.json", {"products": product_rows})
        stage.log("DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
