#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""琴扬小程序静态资源生成脚本（可重复执行）。

职责：
1. 把 prototype/assets/img/measure/*.svg、prototype/assets/img/guide/*.svg 转成小程序可用的 PNG
   （微信小程序 <image> 不支持 SVG 源，故统一转 PNG）。
2. 从 prototype/assets/js/app.js 的 ic{} 图标库抽取内联 SVG，按需着色后输出 PNG
   （避免使用 emoji / 图标字体 / 外链图片）。
3. 复制品牌字标 PNG。

用法：python3 apps/miniprogram/tools/build_assets.py
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path

import cairosvg

ROOT = Path(__file__).resolve().parents[3]
PROTO = ROOT / "prototype"
OUT = ROOT / "apps" / "miniprogram" / "assets"

# 图标名 -> (输出文件名, 颜色, 输出宽度)
ICON_JOBS = [
    ("back", "back_ink", "#272727", 48),
    ("right", "right_gray", "#999999", 32),
    ("down", "down_gray", "#999999", 36),
    ("search", "search_ink", "#272727", 44),
    ("share", "share_ink", "#272727", 44),
    ("arrow", "arrow_ink", "#272727", 40),
    ("arrowLong", "arrowlong_white", "#FFFFFF", 68),
    ("truck", "truck_gold", "#D29B5E", 36),
    ("refresh", "refresh_gold", "#D29B5E", 36),
    ("shield", "shield_gold", "#D29B5E", 36),
    ("ruler", "ruler_gold", "#D29B5E", 36),
    ("chat", "chat_ink", "#272727", 44),
    ("store", "store_ink", "#272727", 44),
    ("cart", "cart_ink", "#272727", 44),
    ("headset", "headset_blue", "#3B78E5", 40),
    ("clipboard", "clipboard_gray", "#DCDCDC", 80),
    ("box", "box_ink", "#272727", 40),
    ("plus", "plus_ink", "#272727", 32),
    ("minus", "minus_ink", "#272727", 32),
    ("close", "close_ink", "#272727", 40),
    ("more", "more_ink", "#272727", 32),
    ("pin", "pin_ink", "#272727", 36),
    ("heart", "heart_ink", "#272727", 40),
    ("gift", "gift_ink", "#272727", 40),
    ("coupon", "coupon_ink", "#272727", 40),
    ("wallet", "wallet_ink", "#272727", 40),
    ("gear", "gear_green", "#3F9B58", 40),
    ("scissors", "scissors_green", "#3F9B58", 40),
    ("home", "tab_home", "#666666", 48),
    ("home", "tab_home_on", "#D29B5E", 48),
    ("category", "tab_category", "#666666", 48),
    ("category", "tab_category_on", "#D29B5E", 48),
    ("ruler", "tab_custom", "#666666", 48),
    ("ruler", "tab_custom_on", "#D29B5E", 48),
    ("user", "tab_mine", "#666666", 48),
    ("user", "tab_mine_on", "#D29B5E", 48),
]


def extract_icons(app_js: Path) -> dict:
    """从 app.js 的 ic{...} 对象里抽取 '名称 -> 内联 SVG 字符串'。"""
    text = app_js.read_text(encoding="utf-8")
    block = re.search(r"var ic = \{(.*?)\n  \};", text, re.S)
    if not block:
        raise SystemExit("未能在 app.js 中定位 ic 图标库")
    icons = {}
    for m in re.finditer(r"(\w+):\s*'(<svg.*?</svg>)'", block.group(1), re.S):
        icons[m.group(1)] = m.group(2)
    return icons


def recolor(svg: str, color: str) -> str:
    svg = svg.replace('currentColor', color)
    return svg


def render(svg: str, width: int, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cairosvg.svg2png(bytestring=svg.encode("utf-8"), write_to=str(out_path), output_width=width)


def main() -> None:
    icons = extract_icons(PROTO / "assets" / "js" / "app.js")

    # 1) 品牌字标
    brand_out = OUT / "brand"
    brand_out.mkdir(parents=True, exist_ok=True)
    for name in ("qinyang-word.png", "qinyang-cn.png"):
        shutil.copyfile(PROTO / "assets" / "img" / "brand" / name, brand_out / name)

    # 2) 量体示意图 SVG -> PNG（同时保留 SVG 源文件作为溯源）
    measure_src = OUT / "measure" / "src"
    measure_src.mkdir(parents=True, exist_ok=True)
    measure_out = OUT / "measure"
    for svg_path in sorted((PROTO / "assets" / "img" / "measure").glob("*.svg")):
        shutil.copyfile(svg_path, measure_src / svg_path.name)
        render(svg_path.read_text(encoding="utf-8"), 300, measure_out / (svg_path.stem + ".png"))

    # 3) 首页量体模块服装线稿
    guide_out = OUT / "guide"
    guide_out.mkdir(parents=True, exist_ok=True)
    for svg_path in sorted((PROTO / "assets" / "img" / "guide").glob("*.svg")):
        render(svg_path.read_text(encoding="utf-8"), 300, guide_out / (svg_path.stem + ".png"))

    # 4) 图标
    icon_out = OUT / "icons"
    icon_out.mkdir(parents=True, exist_ok=True)
    for icon_name, file_name, color, width in ICON_JOBS:
        svg = icons.get(icon_name)
        if not svg:
            raise SystemExit("原型图标库中缺少: " + icon_name)
        render(recolor(svg, color), width, icon_out / (file_name + ".png"))

    print("assets 已生成：", OUT)


if __name__ == "__main__":
    main()
