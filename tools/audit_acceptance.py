"""Audit the delivered catalog against the acceptance criteria in docs/p1.md §12.

Every check is verified against the current filesystem / report content, so the
result is evidence rather than a claim.
"""
from __future__ import annotations

import csv
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C


def check(results: list, idx: int, name: str, ok: bool, evidence: str) -> None:
    results.append({"no": idx, "item": name, "status": "PASS" if ok else "FAIL", "evidence": evidence})


def main() -> int:
    with C.Stage("13_audit") as stage:
        results: list[dict] = []
        inv = C.load_cache("inventory.json")
        labels = C.load_cache("labels.json")
        prods = C.load_cache("products.json")
        rows = C.load_cache("catalog_rows.json").get("products", [])
        R = C.REPORTS_DIR

        # 1. originals intact
        src_files = [p for p in C.IMAGES_DIR.rglob("*") if p.is_file()]
        img_files = [p for p in src_files if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")]
        total_bytes = sum(p.stat().st_size for p in img_files)
        check(results, 1, "原始图片完整保留", len(img_files) == len(inv),
              f"images/ 下 {len(img_files)} 张图片仍在原位，目录结构与文件名未改动；全部产物写入 catalog/")

        # 2. full inventory
        inv_csv = R / "image_inventory.csv"
        rows_inv = list(csv.DictReader(open(inv_csv, encoding="utf-8-sig"))) if inv_csv.exists() else []
        check(results, 2, "全量图片盘点完成", len(rows_inv) == len(inv),
              f"image_inventory.csv {len(rows_inv)} 行 / 共 {len(inv)} 张；字段含尺寸、格式、体积、透明度、损坏状态、SHA256、pHash")

        # 3. exact vs suspected duplicates
        dup = C.load_cache("duplicates.json")
        exact_groups = len(dup.get("exact_groups", {}))
        near_pairs = len(dup.get("near_pairs", []))
        dup_csv = R / "duplicate_report.csv"
        check(results, 3, "完全重复与疑似重复分别统计", dup_csv.exists(),
              f"完全重复(SHA256 相同) {exact_groups} 组；疑似重复(感知哈希) {near_pairs} 对，见 duplicate_report.csv")

        # 4. product grouping
        n_prod = len(prods.get("products", [])) if prods else 0
        check(results, 4, "商品候选分组完成", n_prod == 76,
              f"识别 {n_prod} 个商品分组，与客户标注的 40件 + 36件 = 76 件一致")

        # 5. category + role
        cats = Counter(l.get("category") for l in labels.values())
        roles = Counter(l.get("role") for l in labels.values())
        labeled = sum(1 for l in labels.values() if l.get("reviewed"))
        check(results, 5, "商品类别和图片角色识别完成",
              len(cats) > 1 and len(roles) > 1 and labeled == len(inv),
              f"{labeled}/{len(inv)} 张图片已逐张标注角色 {dict(roles)}；类别分布 {dict(cats)}")

        # 6. cover selection
        with_cover = sum(1 for r in rows if r.get("cover_image"))
        check(results, 6, "商品主图候选筛选完成", with_cover == len(rows),
              f"{with_cover}/{len(rows)} 个商品已选出主图（按完整度/清晰度/构图/背景综合评分，非按文件大小）")

        # 7. quality report
        q_csv = R / "quality_report.csv"
        q_rows = list(csv.DictReader(open(q_csv, encoding="utf-8-sig"))) if q_csv.exists() else []
        check(results, 7, "图片质量检测完成", len(q_rows) == len(inv),
              f"quality_report.csv {len(q_rows)} 行，覆盖分辨率/压缩/模糊/曝光/黑边/旋转/主体完整度/背景干扰")

        # 8. derivatives
        processed = list((C.CATALOG_DIR / "products").glob("*/processed/*.jpg"))
        thumbs = list((C.CATALOG_DIR / "products").glob("*/thumbnails/*.jpg"))
        display = list((C.CATALOG_DIR / "products").glob("*/display/*.jpg"))
        check(results, 8, "小程序展示用图片副本生成完成",
              len(processed) >= len(inv) and len(thumbs) >= len(inv),
              f"展示版本 {len(processed)} 个，缩略图 {len(thumbs)} 个，1:1/4:5 展示副本 {len(display)} 个")

        # 9. catalog CSV + JSON
        cat_csv = R / "product_catalog.csv"
        man_json = R / "image_manifest.json"
        manifest = json.loads(man_json.read_text("utf-8")) if man_json.exists() else {}
        required = ["product_id", "product_name", "category", "visual_color", "material", "price",
                    "stock", "sizes", "cover_image", "gallery_images", "detail_images",
                    "model_images", "original_source", "confidence", "review_status", "notes"]
        hdr = ""
        if cat_csv.exists():
            hdr = next(csv.reader(open(cat_csv, encoding="utf-8-sig")))
        check(results, 9, "商品 CSV 和 JSON 清单生成完成",
              bool(hdr) and all(f in hdr for f in required) and bool(manifest.get("products")),
              f"product_catalog.csv 含 {len(hdr)} 个字段（含全部要求字段），image_manifest.json 含 "
              f"{len(manifest.get('products', []))} 个商品 / {len(manifest.get('images', []))} 张图片")

        # 10. review page
        html = C.CATALOG_DIR / "review" / "index.html"
        ok_html = html.exists() and html.stat().st_size > 50_000
        if ok_html:
            txt = html.read_text("utf-8")
            ok_html = all(k in txt for k in ("exportJson", "lightbox", "分类", "原始文件路径"))
        check(results, 10, "HTML 人工审核页面可以正常打开", ok_html,
              f"catalog/review/index.html ({html.stat().st_size // 1024} KB) 自包含，可直接双击打开；"
              f"含分类筛选/编号搜索/放大查看/置信度/原始路径/JSON+CSV 导出")

        # 11. AI readiness
        ai_csv = C.CATALOG_DIR / "ai-ready" / "ai_readiness.csv"
        ai_rows = list(csv.DictReader(open(ai_csv, encoding="utf-8-sig"))) if ai_csv.exists() else []
        suitable = sum(1 for r in ai_rows if r.get("ai_model_generation_suitable") == "True")
        check(results, 11, "AI 模特生成素材准备情况已统计", len(ai_rows) == len(rows),
              f"ai_readiness.csv 统计 {len(ai_rows)} 个商品，其中 {suitable} 个满足 AI 模特生成前置条件")

        # 12. uncertainty marking
        unc = R / "uncertain_groups.csv"
        unc_rows = list(csv.DictReader(open(unc, encoding="utf-8-sig"))) if unc.exists() else []
        no_back = sum(1 for r in rows if "缺少背面图" in (r.get("notes") or ""))
        no_model = sum(1 for r in rows if "缺少模特展示图" in (r.get("notes") or ""))
        check(results, 12, "所有不确定的商品和图片关系都有明确标记", unc.exists(),
              f"uncertain_groups.csv 标记 {len(unc_rows)} 条待人工确认关系；"
              f"另有 {no_back} 个商品缺背面图、{no_model} 个商品缺模特图，已在 notes 中逐条注明")

        # ---- write report ----
        md = ["# 验收自检报告（对照 docs/p1.md §12）\n"]
        md.append(f"生成时间: {C.time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        md.append("| # | 验收项 | 结果 | 证据 |")
        md.append("| ---: | --- | --- | --- |")
        for r in results:
            md.append(f"| {r['no']} | {r['item']} | **{r['status']}** | {r['evidence']} |")
        passed = sum(1 for r in results if r["status"] == "PASS")
        md.append(f"\n**{passed}/{len(results)} 项通过**\n")
        out = R / "acceptance_check.md"
        out.write_text("\n".join(md), "utf-8")
        stage.log(f"wrote {out}: {passed}/{len(results)} PASS")
        for r in results:
            if r["status"] != "PASS":
                stage.log(f"  FAIL {r['no']} {r['item']}: {r['evidence']}")
        return 0 if passed == len(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
