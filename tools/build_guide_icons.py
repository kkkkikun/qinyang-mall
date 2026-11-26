"""Generate the two home-page line-art guide icons (上装 / 长裤).

Style follows the mini-program reference (ref/首页4.png, ref/首页5.png):
thin grey garment line-drawing on white, a dashed vertical measuring line on
the right, no filled shapes, no arrows, no card frame.

Run:  python3 tools/build_guide_icons.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C

OUT = C.PROJECT_ROOT / "prototype" / "assets" / "img" / "guide"

LINE = "#9A948C"      # 衣身描边
LINE_W = 1.2
GARMENT = "#FFFFFF"
GUIDE = "#A9A29A"     # 虚线量尺
TICK = "#8E877F"      # 刻度短线


def svg(body: str, label: str, w: int = 200, h: int = 200) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        f'width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet" '
        f'role="img" aria-label="{label}">\n'
        f'  <title>{label}</title>\n{body}\n</svg>\n'
    )


def path(d: str, extra: str = "") -> str:
    return f'  <path d="{d}" fill="{GARMENT}" stroke="{LINE}" stroke-width="{LINE_W}" ' \
           f'stroke-linecap="round" stroke-linejoin="round"{extra}/>\n'


def line(d: str, stroke: str = GUIDE, width: float = 1.0, dash: str = "3.2 3.4") -> str:
    return f'  <path d="{d}" fill="none" stroke="{stroke}" stroke-width="{width}" ' \
           f'stroke-linecap="round" stroke-dasharray="{dash}"/>\n'


def solid(d: str, stroke: str = LINE, width: float = 1.0) -> str:
    return f'  <path d="{d}" fill="none" stroke="{stroke}" stroke-width="{width}" ' \
           f'stroke-linecap="round"/>\n'


def dot(cx: float, cy: float, r: float = 1.9) -> str:
    return (f'  <circle cx="{cx}" cy="{cy}" r="{r}" fill="none" '
            f'stroke="{LINE}" stroke-width="0.9"/>\n')


# ---------------------------------------------------------------------------
# 上装：翻领衬衫（袖口罗纹 + 下摆罗纹 + 前襟纽扣 + 胸前横向虚线）
# ---------------------------------------------------------------------------
def top_icon() -> str:
    b = []
    # 衣身轮廓：领口 → 肩 → 袖 → 袖口 → 腋下 → 衣身 → 下摆（窄长比例，对齐 ref 首页4）
    b.append(path(
        "M72,26 "
        "L59,33 "               # 左肩
        "L45,98 "               # 左袖外沿
        "L58,108 "              # 左袖口
        "L64,70 "               # 左袖内沿 → 腋下
        "L60,152 "              # 左衣身
        "C60,157 64,159 70,159 "
        "L106,159 "             # 下摆
        "C112,159 116,157 116,152 "
        "L112,70 "              # 右衣身 → 腋下
        "L118,108 "             # 右袖内沿
        "L131,98 "              # 右袖口
        "L117,33 "              # 右袖外沿
        "L104,26 "              # 右肩
        "C101,36 95,43 88,43 "  # 领口
        "C81,43 75,36 72,26 Z"
    ))
    # 翻领
    b.append(path("M72,26 L88,43 L76,50 L65,33 Z"))
    b.append(path("M104,26 L88,43 L100,50 L111,33 Z"))
    # 前襟 + 纽扣
    b.append(solid("M88,46 L88,157"))
    for y in (60, 80, 100, 120, 140):
        b.append(dot(82, y))
    # 袖口罗纹 / 下摆罗纹
    b.append(solid("M48,94 L61,104"))
    b.append(solid("M115,104 L128,94"))
    b.append(solid("M60,146 C76,150 100,150 116,146"))
    # 胸前横向虚线 + 两端刻度
    b.append(line("M62,80 L114,80"))
    b.append(solid("M62,74 L62,86", TICK, 0.9))
    b.append(solid("M114,74 L114,86", TICK, 0.9))
    # 右侧竖向量尺
    b.append(line("M150,26 L150,159"))
    b.append(solid("M144,159 L156,159", TICK, 0.9))
    return svg("".join(b), "上装量体示意")


# ---------------------------------------------------------------------------
# 长裤：阔腿裤（腰头 + 口袋 + 门襟 + 裤脚罗纹 + 右侧竖向量尺）
# ---------------------------------------------------------------------------
def bottom_icon() -> str:
    b = []
    # 裤身轮廓
    b.append(path(
        "M56,30 "
        "C72,26 104,26 120,30 "   # 腰头上沿
        "L124,56 "
        "L132,160 "
        "C132,166 128,168 122,168 "
        "L100,168 "
        "L92,106 "               # 裆部
        "L84,106 "
        "L76,168 "
        "L54,168 "
        "C48,168 44,166 44,160 "
        "L52,56 Z"
    ))
    # 腰头下沿 + 罗纹
    b.append(solid("M53,45 C70,41 106,41 123,45"))
    for i in range(11):
        x = 60 + i * 5.8
        b.append(solid(f"M{x:.1f},29.5 L{x:.1f},42", TICK, 0.8))
    # 口袋
    b.append(solid("M62,45 C60,58 56,66 50,72"))
    b.append(solid("M114,45 C116,58 120,66 126,72"))
    # 门襟
    b.append(solid("M88,45 L88,92"))
    b.append(solid("M88,92 C88,98 91,102 95,104"))
    # 裤腿折线
    b.append(solid("M66,76 L61,150", "#B8B2AA", 0.8))
    b.append(solid("M110,76 L115,150", "#B8B2AA", 0.8))
    # 裤脚罗纹
    b.append(solid("M45,157 Q60,160 76,158"))
    b.append(solid("M100,158 Q116,160 131,157"))
    # 右侧竖向量尺
    b.append(line("M168,26 L168,168"))
    b.append(solid("M162,168 L174,168", TICK, 0.9))
    return svg("".join(b), "长裤量体示意")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "top.svg").write_text(top_icon(), encoding="utf-8")
    (OUT / "bottom.svg").write_text(bottom_icon(), encoding="utf-8")
    print(f"wrote {OUT}/top.svg, {OUT}/bottom.svg")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
