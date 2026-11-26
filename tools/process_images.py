"""Stage: quality detection + derivative image generation (docs/p1.md §6).

Derivatives produced (originals in images/ are never touched):
  catalog/products/<PID>/processed/<IMG>.jpg    full-resolution display copy,
                                                 original aspect ratio, no crop
  catalog/products/<PID>/thumbnails/<IMG>.jpg  long side ~600px
  catalog/products/<PID>/display/<IMG>_1x1.jpg  padded to 1:1  (product intact)
  catalog/products/<PID>/display/<IMG>_4x5.jpg  padded to 4:5  (product intact)

Padding uses the image's own border colour, so nothing is cropped and no
watermark / logo / label is ever removed or altered.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C

THUMB_LONG_SIDE = 600
PROCESSED_QUALITY = 90
THUMB_QUALITY = 82
DISPLAY_QUALITY = 88

DISPLAY_ROLES = {"cover", "front", "back", "side", "detail", "model", "flatlay", "other"}


def border_color(im: Image.Image) -> tuple[int, int, int]:
    px = im.convert("RGB")
    w, h = px.size
    edges = []
    for x in range(0, w, max(1, w // 60)):
        edges.append(px.getpixel((x, 0)))
        edges.append(px.getpixel((x, h - 1)))
    for y in range(0, h, max(1, h // 60)):
        edges.append(px.getpixel((0, y)))
        edges.append(px.getpixel((w - 1, y)))
    if not edges:
        return (255, 255, 255)
    r = sorted(p[0] for p in edges)[len(edges) // 2]
    g = sorted(p[1] for p in edges)[len(edges) // 2]
    b = sorted(p[2] for p in edges)[len(edges) // 2]
    return (r, g, b)


def padded(im: Image.Image, ratio: float) -> Image.Image:
    """Fit the image inside a (ratio w:h) canvas, padding - never cropping."""
    w, h = im.size
    target_w = max(w, int(round(h * ratio)))
    target_h = max(h, int(round(w / ratio)))
    canvas = Image.new("RGB", (target_w, target_h), border_color(im))
    canvas.paste(im, ((target_w - w) // 2, (target_h - h) // 2))
    if canvas.width > canvas.height * ratio:
        new_w = int(round(canvas.height * ratio))
        canvas = canvas.crop((0, 0, new_w, canvas.height))
    elif canvas.height > canvas.width / ratio:
        new_h = int(round(canvas.width / ratio))
        canvas = canvas.crop((0, 0, canvas.width, new_h))
    return canvas


def quality_row(key: str, rec: dict, feat: dict, lab: dict) -> dict:
    issues: list[str] = []
    w, h = rec.get("width", 0), rec.get("height", 0)
    size_b = rec.get("file_size_bytes", 0)
    bpp = (size_b / (w * h)) if w and h else 0
    megapixels = (w * h) / 1e6 if w and h else 0

    # compression quality proxy: bytes per pixel for a photo of this size
    if bpp < 0.06 and megapixels > 1.0:
        issues.append("严重压缩(bytes/pixel 很低)")
    if feat.get("blurry"):
        issues.append("画面模糊")
    if feat.get("overexposed"):
        issues.append("曝光过度")
    if feat.get("underexposed"):
        issues.append("曝光不足")
    if feat.get("black_border"):
        issues.append("存在明显黑边")
    if feat.get("exif_rotate_needed"):
        issues.append("EXIF 旋转标记未应用")
    if feat.get("subject_complete") is False and feat.get("touches_border", 0) >= 2:
        issues.append("主体贴近画面边缘(≥3边)，需人工确认是否裁切")
    if feat.get("background_busy"):
        issues.append("背景干扰商品展示")
    if max(w, h) < 800:
        issues.append("分辨率过低(长边<800px)")
    if rec.get("is_corrupt"):
        issues.append("文件损坏")
    # a size chart / info board is only reported when the reviewed role says so,
    # or - for unreviewed material - when the stroke pattern is extremely dense
    if lab.get("role") == "size_chart":
        issues.append("尺码图/说明图（按角色标注）")
    elif not lab.get("reviewed") and feat.get("stroke_density", 0) > 0.15:
        issues.append("疑似文字/说明图")

    # ---- composite score 0-100 ----
    score = 100.0
    score -= 22 if feat.get("blurry") else 0
    score -= 18 if feat.get("overexposed") else 0
    score -= 14 if feat.get("underexposed") else 0
    score -= 10 if feat.get("black_border") else 0
    score -= 12 if feat.get("background_busy") else 0
    score -= 12 if max(w, h) < 800 else 0
    score -= 8 if (feat.get("subject_complete") is False and feat.get("touches_border", 0) >= 2) else 0
    score -= 8 if bpp < 0.06 and megapixels > 1.0 else 0
    score -= 6 if feat.get("exif_rotate_needed") else 0
    score = max(0.0, min(100.0, score))

    action = "use_as_is"
    if feat.get("exif_rotate_needed"):
        action = "apply_exif_rotation_on_copy"
    elif max(w, h) < 800:
        action = "use_with_caution"
    elif issues:
        action = "review_before_use"
    if rec.get("is_corrupt"):
        action = "replace_source"

    return {
        "image_id": rec.get("image_id", ""),
        "relative_path": key,
        "width": w,
        "height": h,
        "aspect_ratio": round(w / h, 4) if h else "",
        "file_size_kb": round(size_b / 1024, 1),
        "megapixels": round(megapixels, 2),
        "bytes_per_pixel": round(bpp, 4),
        "sharpness": feat.get("sharpness", ""),
        "edge_density": feat.get("edge_density", ""),
        "mean_luma": feat.get("mean_luma", ""),
        "is_blurry": bool(feat.get("blurry")),
        "is_overexposed": bool(feat.get("overexposed")),
        "is_underexposed": bool(feat.get("underexposed")),
        "has_black_border": bool(feat.get("black_border")),
        "needs_exif_rotation": bool(feat.get("exif_rotate_needed")),
        "subject_complete": feat.get("subject_complete", ""),
        "touches_border": feat.get("touches_border", ""),
        "background_uniform": feat.get("bg_uniform", ""),
        "subject_area_ratio": feat.get("subject_area_ratio", ""),
        "quality_score": round(score, 1),
        "issues": "; ".join(issues),
        "recommended_action": action,
        "role": lab.get("role", ""),
        "role_tags": ",".join(lab.get("role_tags", [])),
        "category": lab.get("category", ""),
        "needs_review": bool(lab.get("needs_review")),
    }


def main() -> int:
    report_only = "--report-only" in sys.argv
    with C.Stage("07_process" if not report_only else "07_process_report") as stage:
        C.ensure_dirs()
        inv = C.load_cache("inventory.json")
        feats = C.load_cache("features.json")
        labels = C.load_cache("labels.json")
        prods = C.load_cache("products.json")
        if not prods:
            stage.log("no product clustering yet - run tools/cluster_products.py first")
            return 2

        member_of: dict[str, str] = {}
        for p in prods["products"]:
            for m in p["members"]:
                member_of[m] = p["product_id"]

        rows = []
        written = {"processed": 0, "thumbnails": 0, "display": 0, "skipped": 0}
        for i, (key, rec) in enumerate(sorted(inv.items()), 1):
            feat = feats.get(key, {})
            lab = labels.get(key, {})
            rows.append(quality_row(key, rec, feat, lab))

            if report_only:
                continue

            pid = member_of.get(key)
            if not pid:
                written["skipped"] += 1
                continue
            src = C.PROJECT_ROOT / key
            img_id = rec.get("image_id") or Path(key).stem
            base = C.CATALOG_DIR / "products" / pid
            try:
                with Image.open(src) as im:
                    im = im.convert("RGB")
                    # --- processed: original resolution, original aspect ---
                    pdir = base / "processed"
                    pdir.mkdir(parents=True, exist_ok=True)
                    im.save(pdir / f"{img_id}.jpg", "JPEG", quality=PROCESSED_QUALITY, subsampling=0, optimize=True)
                    written["processed"] += 1

                    # --- thumbnail: long side 600 ---
                    tdir = base / "thumbnails"
                    tdir.mkdir(parents=True, exist_ok=True)
                    t = im.copy()
                    t.thumbnail((THUMB_LONG_SIDE, THUMB_LONG_SIDE), Image.LANCZOS)
                    t.save(tdir / f"{img_id}.jpg", "JPEG", quality=THUMB_QUALITY, optimize=True)
                    written["thumbnails"] += 1

                    # --- display copies (padded, product never cropped) ---
                    if lab.get("role") in DISPLAY_ROLES:
                        ddir = base / "display"
                        ddir.mkdir(parents=True, exist_ok=True)
                        padded(im, 1.0).save(ddir / f"{img_id}_1x1.jpg", "JPEG", quality=DISPLAY_QUALITY, optimize=True)
                        padded(im, 0.8).save(ddir / f"{img_id}_4x5.jpg", "JPEG", quality=DISPLAY_QUALITY, optimize=True)
                        written["display"] += 2
            except Exception as exc:  # noqa: BLE001
                stage.log(f"processing error {key}: {exc}")
                written["skipped"] += 1
            if i % 50 == 0:
                stage.log(f"processed {i}/{len(inv)}")

        out = C.REPORTS_DIR / "quality_report.csv"
        fields = list(rows[0].keys())
        with open(out, "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.DictWriter(fh, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        stage.log(f"wrote {out} ({len(rows)} rows)")

        stage.log(f"DONE {written}")
        C.save_cache("processing_stats.json", written)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
