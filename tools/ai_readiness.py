"""Stage 8: AI-model generation readiness evaluation (docs/p1.md §10).

Only *prepares* material - it never generates images and never mixes generated
content into the real product library.
"""
from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C


def main() -> int:
    with C.Stage("11_ai_ready") as stage:
        C.ensure_dirs()
        prods = C.load_cache("products.json")
        rows = C.load_cache("catalog_rows.json").get("products", [])
        labels = C.load_cache("labels.json")
        feats = C.load_cache("features.json")
        inv = C.load_cache("inventory.json")
        if not prods or not rows:
            stage.log("run tools/cluster_products.py and tools/build_catalog.py first")
            return 2

        member_of: dict[str, str] = {}
        for p in prods["products"]:
            for m in p["members"]:
                member_of[m] = p["product_id"]

        by_pid: dict[str, list[str]] = defaultdict(list)
        for m, pid in member_of.items():
            by_pid[pid].append(m)

        ai_dir = C.CATALOG_DIR / "ai-ready"
        (ai_dir / "reference").mkdir(parents=True, exist_ok=True)
        (ai_dir / "approved").mkdir(parents=True, exist_ok=True)

        out_rows = []
        ref_rows = []
        for r in rows:
            pid = r["product_id"]
            members = by_pid.get(pid, [])
            fronts, backs, details, fabrics, models, others = [], [], [], [], [], []
            problems = []
            for m in members:
                lab = labels.get(m, {})
                role = lab.get("role", "other")
                f = feats.get(m, {})
                good = (
                    not f.get("blurry")
                    and not f.get("overexposed")
                    and not f.get("underexposed")
                    and f.get("touches_border", 0) < 2
                    and max(inv[m].get("width", 0), inv[m].get("height", 0)) >= 900
                )
                if role in ("cover", "front") and good:
                    fronts.append(m)
                elif role == "back" and good:
                    backs.append(m)
                elif role == "detail" and good:
                    details.append(m)
                elif role == "fabric" and good:
                    fabrics.append(m)
                elif role == "model" and good:
                    models.append(m)
                else:
                    if role in ("cover", "front", "back", "detail"):
                        problems.append(f"{Path(m).name}: 不满足参考图要求")
                    others.append(m)

            has_front = bool(fronts)
            has_back = bool(backs)
            has_detail = bool(details)
            has_model = bool(models)
            has_fabric = bool(fabrics)

            # suitability score
            score = 0
            score += 30 if has_front else 0
            score += 20 if has_detail else 0
            score += 15 if has_fabric else 0
            score += 15 if has_back else 0
            score += 10 if has_model else 0
            if not has_front:
                problems.append("缺少完整清晰的正面图，AI 模特生成结果无法保证还原度")
            if not has_detail:
                problems.append("缺少领口/袖口/纽扣等细节图")
            if not has_fabric:
                problems.append("缺少面料纹理参考，AI 无法还原材质")
            if not has_back:
                problems.append("缺少背面图，AI 背面表现不可控")
            if not has_model:
                problems.append("暂无真人模特参考图（可作为 AI 生成目标风格样本）")
            suitable = has_front and has_detail and score >= 50

            out_rows.append(
                {
                    "product_id": pid,
                    "product_name": r["product_name"],
                    "category": r["category"],
                    "has_front_reference": has_front,
                    "has_back_reference": has_back,
                    "has_detail_reference": has_detail,
                    "has_fabric_reference": has_fabric,
                    "has_model_reference": has_model,
                    "front_reference_images": "; ".join(C.rel(m) for m in fronts[:3]),
                    "back_reference_images": "; ".join(C.rel(m) for m in backs[:2]),
                    "detail_reference_images": "; ".join(C.rel(m) for m in details[:3]),
                    "fabric_reference_images": "; ".join(C.rel(m) for m in fabrics[:3]),
                    "model_reference_images": "; ".join(C.rel(m) for m in models[:2]),
                    "ai_suitability_score": score,
                    "ai_model_generation_suitable": suitable,
                    "reference_image_count": len(fronts) + len(backs) + len(details) + len(fabrics) + len(models),
                    "current_issues": "; ".join(dict.fromkeys(problems)) or "无明显问题",
                    "review_status": r["review_status"],
                }
            )
            for role, lst in (("front", fronts), ("back", backs), ("detail", details),
                              ("fabric", fabrics), ("model", models)):
                for m in lst[:3]:
                    ref_rows.append(
                        {
                            "product_id": pid,
                            "role": role,
                            "image_id": inv[m].get("image_id", ""),
                            "source_path": C.rel(m),
                            "processed_path": C.rel(
                                C.CATALOG_DIR / "products" / pid / "processed" / f"{inv[m].get('image_id','')}.jpg"
                            ),
                            "approved_for_ai": "no",
                        }
                    )

        out_csv = ai_dir / "ai_readiness.csv"
        with open(out_csv, "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.DictWriter(fh, fieldnames=list(out_rows[0].keys()))
            w.writeheader()
            w.writerows(out_rows)
        stage.log(f"wrote {out_csv} ({len(out_rows)} products)")

        out_json = ai_dir / "ai_readiness.json"
        out_json.write_text(
            json.dumps(
                {
                    "generatedAt": C.time.strftime("%Y-%m-%dT%H:%M:%S"),
                    "policy": "本阶段仅准备素材，不生成任何 AI 图片；生成结果必须单独标记并经人工审核后方可进入正式商品图库。",
                    "products": out_rows,
                },
                ensure_ascii=False,
                indent=2,
            ),
            "utf-8",
        )
        stage.log(f"wrote {out_json}")

        ref_csv = ai_dir / "reference" / "ai_reference_pool.csv"
        with open(ref_csv, "w", newline="", encoding="utf-8-sig") as fh:
            w = csv.DictWriter(fh, fieldnames=["product_id", "role", "image_id", "source_path", "processed_path", "approved_for_ai"])
            w.writeheader()
            w.writerows(ref_rows)
        stage.log(f"wrote {ref_csv} ({len(ref_rows)} reference images)")

        (ai_dir / "approved" / "README.md").write_text(
            "# ai-ready/approved\n\n"
            "此目录用于存放**经过人工审核批准**的 AI 生成素材。\n\n"
            "规则：\n"
            "1. AI 生成图片不得混入 `catalog/products/*/processed/` 等真实商品原图目录。\n"
            "2. 每张 AI 生成图必须显式标注 `ai_generated: true` 并在文件名中包含 `AI_` 前缀。\n"
            "3. 未经人工审核确认的生成图只能留在本目录的 `pending/` 子目录中。\n\n"
            f"当前状态：**空**（本阶段未生成任何 AI 图片）。\n",
            "utf-8",
        )

        ready = sum(1 for r in out_rows if r["ai_model_generation_suitable"])
        stage.log(f"DONE suitable_for_ai={ready}/{len(out_rows)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
