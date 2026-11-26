"""Phase 1 — full image inventory.

Scans images/ recursively (read-only) and records for every image:
filename, relative path, format, byte size, width, height, aspect ratio,
alpha-channel flag, corruption flag, SHA256, perceptual hash, and low-res flag.

Resumable: per-file results are cached in catalog/.cache/inventory.json and
skipped on re-run unless the file's (path, size, mtime) triple changed.
"""
from __future__ import annotations

import csv
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image, ImageFile

import common as C

ImageFile.LOAD_TRUNCATED_IMAGES = False
Image.MAX_IMAGE_PIXELS = None

CSV_FIELDS = [
    "image_id",
    "filename",
    "relative_path",
    "library",
    "source_folder",
    "format",
    "width",
    "height",
    "aspect_ratio",
    "orientation",
    "file_size_bytes",
    "file_size_kb",
    "megapixels",
    "has_alpha",
    "is_corrupt",
    "error",
    "sha256",
    "phash",
    "dhash",
    "ahash",
    "is_exact_duplicate",
    "duplicate_group",
    "duplicate_of",
    "is_low_resolution",
    "resolution_band",
]


def resolution_band(w: int, h: int) -> str:
    long_edge = max(w, h)
    short_edge = min(w, h)
    if long_edge < 400:
        return "tiny_<400"
    if long_edge < 800:
        return "small_400-799"
    if long_edge < 1200:
        return "medium_800-1199"
    if long_edge < 2000:
        return "good_1200-1999"
    if long_edge < 3000:
        return "high_2000-2999"
    return "ultra_3000+"


def low_res_reason(w: int, h: int) -> str:
    """Short human reason a picture is considered too small for a mall."""
    reasons = []
    if max(w, h) < 800:
        reasons.append("长边<800px")
    if min(w, h) < 600:
        reasons.append("短边<600px")
    if w * h < 480 * 480:
        reasons.append("像素总量过少")
    return "; ".join(reasons)


def analyze(path: Path) -> dict:
    rec: dict = {"error": ""}
    try:
        rec["file_size_bytes"] = path.stat().st_size
        with Image.open(path) as im:
            rec["format"] = (im.format or path.suffix.lstrip(".")).upper()
            w, h = im.size
            rec["width"], rec["height"] = w, h
            rec["has_alpha"] = (
                im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info
            )
            rec["is_corrupt"] = False
            # verify the pixel data actually decodes
            try:
                im.verify()
            except Exception as exc:  # noqa: BLE001
                rec["is_corrupt"] = True
                rec["error"] = f"verify:{exc}"
    except Exception as exc:  # noqa: BLE001
        rec.update(
            {
                "format": path.suffix.lstrip(".").upper() or "UNKNOWN",
                "width": 0,
                "height": 0,
                "has_alpha": False,
                "is_corrupt": True,
                "error": f"{type(exc).__name__}:{exc}",
                "file_size_bytes": path.stat().st_size if path.exists() else 0,
            }
        )
    return rec


def main() -> int:
    with C.Stage("01_inventory") as stage:
        C.ensure_dirs()
        cache = C.load_cache("inventory.json")
        files = list(C.iter_source_images())
        stage.log(f"source images discovered: {len(files)}")

        records: dict[str, dict] = {}
        changed = 0
        for i, path in enumerate(files, 1):
            key = C.rel(path)
            st = path.stat()
            fp = f"{st.st_size}:{int(st.st_mtime)}"
            prev = cache.get(key)
            if prev and prev.get("fingerprint") == fp:
                records[key] = prev
                continue
            changed += 1
            rec = analyze(path)
            rec["fingerprint"] = fp
            rec["relative_path"] = key
            rec["filename"] = path.name
            rec["sha256"] = C.sha256_file(path)
            records[key] = rec
            if i % 25 == 0:
                stage.log(f"scanned {i}/{len(files)}")
        stage.log(f"newly analyzed: {changed}; reused from cache: {len(files) - changed}")

        # perceptual hashes (pHash/dHash/aHash) for near-duplicate detection
        import localhash as LH

        ph_count = 0
        for key, rec in records.items():
            if rec.get("phash") and rec.get("dhash") and rec.get("ahash"):
                continue
            p = C.PROJECT_ROOT / key
            try:
                with Image.open(p) as im:
                    rec.update(LH.all_hashes(im))
                    ph_count += 1
            except Exception as exc:  # noqa: BLE001
                rec.setdefault("phash", "")
                rec.setdefault("dhash", "")
                rec.setdefault("ahash", "")
                rec.setdefault("phash_error", f"{exc}")
        stage.log(f"perceptual hashes computed: {ph_count}")

        # library / folder provenance
        for key, rec in records.items():
            parts = Path(key).parts
            rec["library"] = parts[2] if len(parts) > 2 else ""
            rec["source_folder"] = parts[3] if len(parts) > 3 else ""

        # exact duplicate grouping by sha256
        by_sha: dict[str, list[str]] = {}
        for key, rec in records.items():
            if rec.get("sha256"):
                by_sha.setdefault(rec["sha256"], []).append(key)
        dup_groups = {s: sorted(v) for s, v in by_sha.items() if len(v) > 1}
        dup_index: dict[str, tuple[str, str]] = {}
        for gi, (sha, members) in enumerate(sorted(dup_groups.items()), 1):
            gid = f"DUP-{gi:04d}"
            for idx, m in enumerate(members):
                dup_index[m] = (gid, members[0] if idx else "")

        rows = []
        for idx, key in enumerate(sorted(records), 1):
            rec = records[key]
            rec["image_id"] = f"IMG-{idx:04d}"
            w, h = rec.get("width", 0), rec.get("height", 0)
            gid, dup_of = dup_index.get(key, ("", ""))
            rows.append(
                {
                    "image_id": rec["image_id"],
                    "filename": rec.get("filename", ""),
                    "relative_path": key,
                    "library": rec.get("library", ""),
                    "source_folder": rec.get("source_folder", ""),
                    "format": rec.get("format", ""),
                    "width": w,
                    "height": h,
                    "aspect_ratio": round(w / h, 4) if h else "",
                    "orientation": "portrait" if h > w else ("landscape" if w > h else "square"),
                    "file_size_bytes": rec.get("file_size_bytes", 0),
                    "file_size_kb": round(rec.get("file_size_bytes", 0) / 1024, 1),
                    "megapixels": round(w * h / 1e6, 2),
                    "has_alpha": rec.get("has_alpha", False),
                    "is_corrupt": rec.get("is_corrupt", False),
                    "error": rec.get("error", ""),
                    "sha256": rec.get("sha256", ""),
                    "phash": rec.get("phash", ""),
                    "dhash": rec.get("dhash", ""),
                    "ahash": rec.get("ahash", ""),
                    "is_exact_duplicate": bool(gid),
                    "duplicate_group": gid,
                    "duplicate_of": C.rel(dup_of) if dup_of else "",
                    "is_low_resolution": bool(low_res_reason(w, h)),
                    "resolution_band": resolution_band(w, h),
                }
            )

        out_csv = C.REPORTS_DIR / "image_inventory.csv"
        with open(out_csv, "w", newline="", encoding="utf-8-sig") as fh:
            writer = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        stage.log(f"wrote {out_csv} ({len(rows)} rows)")

        # ---- summary ----
        total_bytes = sum(r["file_size_bytes"] for r in rows)
        fmt_counter = Counter(r["format"] for r in rows)
        band_counter = Counter(r["resolution_band"] for r in rows)
        orient_counter = Counter(r["orientation"] for r in rows)
        lib_counter = Counter(r["library"] for r in rows)
        folder_counter = Counter(f"{r['library']}/{r['source_folder']}" for r in rows)
        corrupt = [r for r in rows if r["is_corrupt"]]
        alpha = [r for r in rows if r["has_alpha"]]
        lowres = [r for r in rows if r["is_low_resolution"]]
        exact_dup_files = sum(len(v) for v in dup_groups.values())
        exact_dup_extra = exact_dup_files - len(dup_groups)
        widths = sorted(r["width"] for r in rows if r["width"])
        heights = sorted(r["height"] for r in rows if r["height"])

        def human(n: float) -> str:
            for unit in ("B", "KB", "MB", "GB"):
                if n < 1024:
                    return f"{n:.1f} {unit}"
                n /= 1024
            return f"{n:.1f} TB"

        md: list[str] = []
        md.append("# 鄂多蘭商品图库 — 盘点摘要 (Phase 1)\n")
        md.append(f"- 生成时间: {C.time.strftime('%Y-%m-%d %H:%M:%S')}")
        md.append(f"- 原始素材目录: `images/` (只读，未做任何修改)")
        md.append(f"- 图片总数: **{len(rows)}**")
        md.append(f"- 原始图库占用空间: **{human(total_bytes)}** ({total_bytes:,} bytes)")
        md.append(f"- 损坏/无法解码图片: **{len(corrupt)}**")
        md.append(f"- 含透明通道图片: **{len(alpha)}**")
        md.append(f"- 低分辨率图片: **{len(lowres)}**")
        md.append(f"- 完全重复(SHA256 相同)分组: **{len(dup_groups)}** 组 / 涉及 **{exact_dup_files}** 个文件 / 可归并冗余 **{exact_dup_extra}** 个")
        md.append("")
        md.append("## 1. 格式分布\n")
        md.append("| 格式 | 数量 | 占比 |")
        md.append("| --- | ---: | ---: |")
        for k, v in fmt_counter.most_common():
            md.append(f"| {k} | {v} | {v / len(rows) * 100:.1f}% |")
        md.append("")
        md.append("## 2. 分辨率区间\n")
        md.append("| 区间 (按长边) | 数量 | 占比 |")
        md.append("| --- | ---: | ---: |")
        order = ["tiny_<400", "small_400-799", "medium_800-1199", "good_1200-1999", "high_2000-2999", "ultra_3000+"]
        for k in order:
            if band_counter.get(k):
                md.append(f"| {k} | {band_counter[k]} | {band_counter[k] / len(rows) * 100:.1f}% |")
        md.append("")
        md.append(f"- 宽度区间: {widths[0] if widths else 0} – {widths[-1] if widths else 0} px (中位数 {widths[len(widths)//2] if widths else 0} px)")
        md.append(f"- 高度区间: {heights[0] if heights else 0} – {heights[-1] if heights else 0} px (中位数 {heights[len(heights)//2] if heights else 0} px)")
        md.append("")
        md.append("## 3. 朝向分布\n")
        md.append("| 朝向 | 数量 |")
        md.append("| --- | ---: |")
        for k, v in orient_counter.most_common():
            md.append(f"| {k} | {v} |")
        md.append("")
        md.append("## 4. 图库 / 子目录分布\n")
        md.append("| 图库 | 图片数 |")
        md.append("| --- | ---: |")
        for k, v in lib_counter.most_common():
            md.append(f"| {k} | {v} |")
        md.append("")
        md.append(f"### 子目录 (共 {len(folder_counter)} 个)\n")
        md.append("| 子目录 | 图片数 |")
        md.append("| --- | ---: |")
        for k, v in sorted(folder_counter.items()):
            md.append(f"| {k} | {v} |")
        md.append("")
        if corrupt:
            md.append("## 5. 损坏文件\n")
            for r in corrupt:
                md.append(f"- `{r['relative_path']}` — {r['error']}")
            md.append("")
        md.append("## 6. 低分辨率图片明细\n")
        md.append("| 文件 | 尺寸 | 原因 |")
        md.append("| --- | --- | --- |")
        for r in lowres[:80]:
            md.append(f"| `{r['relative_path']}` | {r['width']}x{r['height']} | {low_res_reason(r['width'], r['height'])} |")
        if len(lowres) > 80:
            md.append(f"| … | | 其余 {len(lowres) - 80} 个见 CSV |")
        md.append("")
        out_md = C.REPORTS_DIR / "inventory_summary.md"
        out_md.write_text("\n".join(md), "utf-8")
        stage.log(f"wrote {out_md}")

        C.save_cache("inventory.json", records)
        stage.log(
            f"DONE images={len(rows)} exact_dup_groups={len(dup_groups)} "
            f"corrupt={len(corrupt)} lowres={len(lowres)} size={human(total_bytes)}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
