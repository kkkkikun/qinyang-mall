"""Generate the 12 static HTML shells of the 琴扬 prototype.

Every page is a thin shell: the layout is rendered by
prototype/assets/js/app.js (PAGES[data-page]) from the data layer in
prototype/assets/js/data.js.

Run:  python3 tools/build_prototype_pages.py
"""
from __future__ import annotations

import pathlib

PROTO = pathlib.Path(__file__).resolve().parents[1] / "prototype"

# (filename, body[data-page], <title>)
PAGES = [
    ("index.html", "home", "琴扬精纺羊绒 · 专属定制"),
    ("category.html", "category", "商品分类 · 琴扬"),
    ("search.html", "search", "搜索 · 琴扬"),
    ("product.html", "product", "商品详情 · 琴扬"),
    ("sizing-guide.html", "guide", "量体指南 · 琴扬"),
    ("measurement.html", "measure", "填写尺寸 · 琴扬"),
    ("measurement-confirm.html", "measureConfirm", "确认量体数据 · 琴扬"),
    ("cart.html", "cart", "购物车 · 琴扬"),
    ("order-confirm.html", "orderConfirm", "确认订单 · 琴扬"),
    ("profile.html", "profile", "个人中心 · 琴扬"),
    ("orders.html", "orders", "我的订单 · 琴扬"),
    ("order-detail.html", "orderDetail", "订单详情 · 琴扬"),
]

TPL = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#F5F1E9">
<meta name="description" content="琴扬定制服装商城原型 V1：自主量体、按需定制。">
<title>{title}</title>
<link rel="stylesheet" href="assets/css/app.css">
</head>
<body data-page="{page}">
<div id="app" class="app"></div>
<script src="assets/js/data.js"></script>
<script src="assets/js/app.js"></script>
</body>
</html>
"""


def main() -> int:
    for name, page, title in PAGES:
        out = PROTO / name
        out.write_text(TPL.format(page=page, title=title), encoding="utf-8")
        print(f"wrote {out.relative_to(PROTO.parent)}")
    print(f"DONE: {len(PAGES)} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
