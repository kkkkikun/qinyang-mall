"""Build the prototype's product configuration from the catalog assets.

The prototype must reuse the real, already-catalogued product data instead of
re-typing it, so this script derives `prototype/data/products.json` from
`catalog/reports/image_manifest.json` + `catalog/reports/product_catalog.csv`.

Nothing that the client has not confirmed is invented:
  * price / material / craftsmanship / care_instructions / description stay
    empty and are rendered as "待确认";
  * product_id keeps the temporary ED-XXXX asset id.

Measurement templates are authored in `prototype/data/measurement_templates.json`
and only *linked* here (measurement_template_id), so new fields never require
touching page code.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C

PROTO = C.PROJECT_ROOT / "prototype"

CATEGORY_TEMPLATE = {
    "knitwear": "TPL-KNIT-TOPS",
    "shirts": "TPL-KNIT-TOPS",
    "clothing": "TPL-OUTER",
    "scarves": "TPL-SCARF",
    "accessories": "TPL-GENERIC",
    "unknown": "TPL-GENERIC",
}

# "其他服装" mixes bottoms / outerwear / hoodies -> pick the template by the
# visual review note (temporary product name) instead of a blanket default.
BOTTOM_HINTS = ("裤", "裙")

CATEGORY_LABEL = {
    "shirts": "衬衫",
    "scarves": "围巾",
    "knitwear": "针织服饰",
    "clothing": "其他服装",
    "accessories": "其他配饰",
    "unknown": "待确认",
}

# ---------------------------------------------------------------------------
# 二级分组（形态 / 品类）
# ---------------------------------------------------------------------------
# 分类页需要「一级分类 + 二级分组」两层（对齐 ref 的「女装区 → 全部 / 外形 / 裤装」）。
# 我们没有客户确认的正式分类表，因此这里只按**临时命名里已经存在的品类词**做归类，
# 纯粹是展示层分组：不新增任何客户未确认的商品信息，正式分类待客户确认后可整表替换。
# 规则顺序即匹配优先级，(id, 显示名, 命中关键词)，空关键词表示兜底桶。
GROUP_RULES = {
    "knitwear": [
        ("cardigan", "开衫", ("开衫",)),
        ("polo", "polo", ("polo",)),
        ("shirt", "衬衫", ("衬衫",)),
        ("vest", "背心", ("背心", "马甲")),
        ("knitshirt", "针织衫", ()),
    ],
    "clothing": [
        ("outer", "外套", ("外套", "大衣", "西装")),
        ("hoodie", "卫衣", ("卫衣",)),
        ("bottoms", "裤装", ("裤",)),
        ("skirt", "裙装", ("裙",)),
        ("top", "上衣", ()),
    ],
    "scarves": [
        ("scarf", "围巾", ("围巾",)),
        ("shawl", "披肩", ("披肩",)),
        ("kerchief", "巾类", ()),
    ],
    "shirts": [
        ("shirt", "衬衫", ()),
    ],
    "accessories": [
        ("acc", "其他配饰", ()),
    ],
    "unknown": [
        ("unknown", "待确认", ()),
    ],
}


def pick_group(category: str, name: str) -> tuple[str, str]:
    """按品类关键词把商品归入二级分组，返回 (group_id, group_label)。"""
    low = name.lower()
    for gid, label, keys in GROUP_RULES.get(category, GROUP_RULES["unknown"]):
        if not keys:
            return gid, label
        for k in keys:
            if k.lower() in low:
                return gid, label
    gid, label, _ = GROUP_RULES.get(category, GROUP_RULES["unknown"])[-1]
    return gid, label


def main() -> int:
    with C.Stage("20_prototype_data") as stage:
        C.ensure_dirs()
        (PROTO / "data").mkdir(parents=True, exist_ok=True)
        (PROTO / "assets" / "js").mkdir(parents=True, exist_ok=True)
        (PROTO / "assets" / "css").mkdir(parents=True, exist_ok=True)
        (PROTO / "assets" / "img" / "measure").mkdir(parents=True, exist_ok=True)

        manifest = json.loads((C.REPORTS_DIR / "image_manifest.json").read_text("utf-8"))
        rows = list(csv.DictReader((C.REPORTS_DIR / "product_catalog.csv").open(encoding="utf-8-sig")))
        imgs_by_product: dict[str, list[dict]] = {}
        for im in manifest["images"]:
            imgs_by_product.setdefault(im["productId"], []).append(im)

        products = []
        for r in rows:
            pid = r["product_id"]
            ims = imgs_by_product.get(pid, [])
            gallery = []
            for im in sorted(ims, key=lambda x: x["imageId"]):
                gallery.append(
                    {
                        "image_id": im["imageId"],
                        "role": im["role"],
                        "role_label": im["roleLabel"],
                        "width": im["width"],
                        "height": im["height"],
                        "thumbnail": im["thumbnail"],
                        "full": im["processed"],
                        "display_1x1": (im.get("display") or {}).get("1x1"),
                        "display_4x5": (im.get("display") or {}).get("4x5"),
                    }
                )
            cover = next((g for g in gallery if g["role"] == "cover"), gallery[0] if gallery else None)
            template_id = CATEGORY_TEMPLATE.get(r["category"], "TPL-GENERIC")
            if r["category"] == "clothing" and any(h in r["product_name"] for h in BOTTOM_HINTS):
                template_id = "TPL-BOTTOM"
            gid, glabel = pick_group(r["category"], r["product_name"])
            products.append(
                {
                    "product_id": pid,
                    "product_name": r["product_name"],
                    "category": r["category"],
                    "category_label": r["category_label"],
                    "group": gid,
                    "group_label": glabel,
                    "visual_color": r["visual_color"],
                    "price": None,
                    "price_display": "待确认",
                    "cover_image": cover["thumbnail"] if cover else "",
                    "cover_full": cover["full"] if cover else "",
                    "cover_display_1x1": cover["display_1x1"] if cover else "",
                    "cover_display_4x5": cover["display_4x5"] if cover else "",
                    "gallery_images": [g["thumbnail"] for g in gallery],
                    "gallery": gallery,
                    "description": None,
                    "material": None,
                    "craftsmanship": None,
                    "care_instructions": None,
                    "measurement_template_id": template_id,
                    "publish_status": "pending_client_confirmation",
                    "image_count": int(r["image_count"]),
                    "original_source": r["original_source"],
                    "confidence": r["confidence"],
                    "review_status": r["review_status"],
                    "notes": r["notes"],
                    "detail_count": sum(1 for g in gallery if g["role"] == "detail"),
                    "fabric_count": sum(1 for g in gallery if g["role"] == "fabric"),
                    "back_count": sum(1 for g in gallery if g["role"] == "back"),
                }
            )

        categories = []
        for k in ("knitwear", "shirts", "scarves", "clothing", "accessories", "unknown"):
            members = [p for p in products if p["category"] == k]
            groups = []
            for gid, label, _ in GROUP_RULES.get(k, GROUP_RULES["unknown"]):
                n = sum(1 for p in members if p["group"] == gid)
                if n:
                    groups.append({"id": gid, "label": label, "count": n})
            categories.append(
                {"id": k, "label": CATEGORY_LABEL[k], "count": len(members), "groups": groups}
            )

        out = {
            "schemaVersion": "1.1",
            "generatedAt": C.time.strftime("%Y-%m-%dT%H:%M:%S"),
            "project": "鄂多蘭 定制服装商城原型 V1",
            "source": "catalog/reports/image_manifest.json + product_catalog.csv",
            "pricePolicy": "客户未提供价格 / 材质 / 商品文案，原型中一律显示『待确认』，不做任何推测。",
            "groupPolicy": "二级分组按临时命名中的品类词归类，仅用于页面分组展示，非客户确认的正式分类，待确认后可整表替换。",
            "categories": categories,
            "products": products,
        }
        (PROTO / "data" / "products.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=1), "utf-8"
        )
        stage.log(f"wrote prototype/data/products.json ({len(products)} products)")

        # templates: authored file, validated here
        tpl_path = PROTO / "data" / "measurement_templates.json"
        if not tpl_path.exists():
            stage.log("measurement_templates.json missing - create it before running")
            return 2
        templates = json.loads(tpl_path.read_text("utf-8"))
        ids = {t["template_id"] for t in templates["templates"]}
        missing = {p["measurement_template_id"] for p in products} - ids
        if missing:
            stage.log(f"templates missing for: {missing}")
            return 2
        stage.log(f"templates ok: {sorted(ids)}")

        # single-file bundle so the prototype also works from file://
        bundle = {
            "products": out,
            "templates": templates,
        }
        (PROTO / "assets" / "js" / "data.js").write_text(
            "/* 自动生成，请勿手工修改；数据源 prototype/data/*.json */\n"
            "window.ED_DATA = " + json.dumps(bundle, ensure_ascii=False) + ";\n",
            "utf-8",
        )
        stage.log(f"wrote prototype/assets/js/data.js ({(PROTO / 'assets' / 'js' / 'data.js').stat().st_size // 1024} KB)")
        stage.log("DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
