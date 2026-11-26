"""Generate the measurement line-art illustrations (SVG) for the prototype.

Elegant fashion-illustration line drawings that follow the client reference
screenshots in ``ref/``: thin grey garment outlines on white, soft beige body
figures, brown double-headed measuring arrows and a ticked tape band.

No screenshots from the old mini-program are embedded - everything is drawn as
vector line art.  Run:  python3 tools/build_measure_illustrations.py
"""
from __future__ import annotations

import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C

OUT = C.PROJECT_ROOT / "prototype" / "assets" / "img" / "measure"

# --- palette ---------------------------------------------------------------
LINE = "#9A948C"        # 细灰描边 - garment / body outline
LINE_W = 1.3
BODY = "#EDE2D7"        # 柔和米色 - skin
GARMENT = "#FFFFFF"     # 羊绒白 - garment fill
CLOTH = "#F4EBE2"       # 织物浅色 - trousers
MEASURE = "#7A5B3E"     # 棕褐 - measuring arrow / tape
MEASURE_W = 1.6
RIBBING = "#B8B1A8"     # 罗纹辅助线
RIBBING_W = 0.7
HALO = "#FFFFFF"        # 箭头底衬

W, H = 200, 200

# --- shared attribute strings ---------------------------------------------
A_GARMENT = (
    f'fill="{GARMENT}" stroke="{LINE}" stroke-width="{LINE_W}" '
    'stroke-linecap="round" stroke-linejoin="round"'
)
A_BODY = (
    f'fill="{BODY}" stroke="{LINE}" stroke-width="{LINE_W}" '
    'stroke-linecap="round" stroke-linejoin="round"'
)
A_CLOTH = (
    f'fill="{CLOTH}" stroke="{LINE}" stroke-width="{LINE_W}" '
    'stroke-linecap="round" stroke-linejoin="round"'
)
A_RIB = f'fill="none" stroke="{RIBBING}" stroke-width="{RIBBING_W}" stroke-linecap="round"'
A_MEAS = f'fill="none" stroke="{MEASURE}" stroke-width="{MEASURE_W}" stroke-linecap="round"'
A_TAPE = f'fill="none" stroke="{MEASURE}" stroke-width="1.05" stroke-linecap="round"'


# ===========================================================================
# tiny path helpers
# ===========================================================================
def _segments(d: str) -> list[tuple[str, tuple, list[tuple]]]:
    """Parse a path into absolute segments: ``(cmd, start, params)``.

    ``params`` holds the points after ``start``:
    L -> [end], C -> [c1, c2, end], Q -> [ctrl, end].
    Keeping the start point of every segment is what makes a reversed traversal
    continuous - without it the mirrored half detaches from the garment.
    """
    tokens = re.findall(r"[MLCQZ]|-?\d*\.?\d+", d)
    out: list[tuple[str, tuple, list[tuple]]] = []
    i = 0
    cmd = "M"
    cur = (0.0, 0.0)
    while i < len(tokens):
        if tokens[i] in "MLCQZ":
            cmd = tokens[i]
            i += 1
            if cmd == "Z":
                out.append(("Z", cur, []))
                continue
        nums: list[float] = []
        while i < len(tokens) and tokens[i] not in "MLCQZ":
            nums.append(float(tokens[i]))
            i += 1
        if cmd == "C":
            if len(nums) >= 8:
                p0 = (nums[0], nums[1]); c1 = (nums[2], nums[3])
                c2 = (nums[4], nums[5]); e = (nums[6], nums[7])
            else:
                p0 = cur; c1 = (nums[0], nums[1])
                c2 = (nums[2], nums[3]); e = (nums[4], nums[5])
            out.append(("C", p0, [c1, c2, e])); cur = e
        elif cmd == "Q":
            if len(nums) >= 6:
                p0 = (nums[0], nums[1]); c = (nums[2], nums[3]); e = (nums[4], nums[5])
            else:
                p0 = cur; c = (nums[0], nums[1]); e = (nums[2], nums[3])
            out.append(("Q", p0, [c, e])); cur = e
        else:
            for k in range(0, len(nums) - 1, 2):
                e = (nums[k], nums[k + 1])
                if cmd == "M":
                    out.append(("M", e, [e])); cur = e
                else:
                    out.append(("L", cur, [e])); cur = e
    return out


def _mirror_segs(d: str, axis: float):
    """Mirror every point about ``axis`` and traverse the path backwards."""
    def mx(p):
        return (2 * axis - p[0], p[1])

    mir: list[tuple[str, tuple, list[tuple]]] = []
    for cmd, start, params in _segments(d):
        if cmd == "Z":
            continue
        start = mx(start)
        params = [mx(p) for p in params]
        if cmd == "C":
            c1, c2, e = params
            mir.append(("C", e, [c2, c1, start]))
        elif cmd == "Q":
            c, e = params
            mir.append(("Q", e, [c, start]))
        else:
            mir.append(("L", params[0], [start]))
    return list(reversed(mir))


def _emit(segs, move: bool = True) -> str:
    """Emit a path string.

    ``move`` controls whether the first segment opens a new subpath (True) or
    continues the current one (False). Continuing matters for symmetric shapes:
    a stray moveto would make the closing ``Z`` snap back to the wrong point.
    """
    out: list[str] = []
    for idx, (cmd, start, params) in enumerate(segs):
        if idx == 0 and move:
            out.append("M" + _fmt([start]))
        if cmd == "C":
            out.append("C" + _fmt(params))
        elif cmd == "Q":
            out.append("Q" + _fmt(params))
        else:
            out.append("L" + _fmt(params))
    return " ".join(out)


def mirrored(d: str, axis: float = W / 2) -> str:
    """Mirror ``d`` about ``axis`` and traverse it backwards, as a closed shape."""
    return _emit(_mirror_segs(d, axis)) + " Z"


def mirrored_open(d: str, axis: float = W / 2) -> str:
    """Mirror ``d`` about ``axis`` backwards, as a continuation of the same subpath.

    Appended after the original path it closes a full symmetric outline.
    """
    return _emit(_mirror_segs(d, axis), move=False)


def mirrored_pair(d: str, axis: float = W / 2) -> str:
    """Original path followed by its mirrored reverse - one closed symmetric shape."""
    return d + " " + mirrored_open(d, axis) + " Z"


def _fmt(points: list[tuple[float, float]]) -> str:
    return " ".join(f"{x:g},{y:g}" for x, y in points)


def path(d: str, attrs: str) -> str:
    return f'<path d="{d}" {attrs}/>'


def qbez(p0, p1, p2, t):
    mt = 1 - t
    return (
        mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
        mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
    )


def hatch_q(p0o, p1o, p2o, p0i, p1i, p2i, n: int) -> str:
    """Short lines joining two quadratic curves - used for ribbing bands."""
    out = []
    for i in range(1, n):
        t = i / n
        a = qbez(p0o, p1o, p2o, t)
        b = qbez(p0i, p1i, p2i, t)
        out.append(f'<line x1="{a[0]:.2f}" y1="{a[1]:.2f}" x2="{b[0]:.2f}" y2="{b[1]:.2f}" {A_RIB}/>')
    return "".join(out)


def hatch_band(p0, p1, p2, p3, n: int) -> str:
    """Ribbing between two parallel straight edges p0-p1 (top) and p2-p3 (bottom).

    Both edges are walked left to right so the hatch marks stay perpendicular
    instead of crossing each other.
    """
    out = []
    for i in range(1, n):
        t = i / n
        ax = p0[0] + (p1[0] - p0[0]) * t
        ay = p0[1] + (p1[1] - p0[1]) * t
        bx = p2[0] + (p3[0] - p2[0]) * t
        by = p2[1] + (p3[1] - p2[1]) * t
        out.append(f'<line x1="{ax:.2f}" y1="{ay:.2f}" x2="{bx:.2f}" y2="{by:.2f}" {A_RIB}/>')
    return "".join(out)


# ===========================================================================
# measuring arrows / tape
# ===========================================================================
def arrow(p1, p2, head: float = 7.0, hw: float = 3.0, ticks: bool = True,
          halo: bool = True) -> str:
    """Brown double-headed arrow with a faint white halo underneath."""
    (x1, y1), (x2, y2) = p1, p2
    dx, dy = x2 - x1, y2 - y1
    length = math.hypot(dx, dy) or 1.0
    ux, uy = dx / length, dy / length
    nx, ny = -uy, ux
    out: list[str] = []
    if halo:
        out.append(
            f'<line x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}" '
            f'stroke="{HALO}" stroke-width="4.4" stroke-linecap="round"/>'
        )
    if ticks:
        for (px, py), s in (((x1, y1), 1.0), ((x2, y2), -1.0)):
            cx = px + ux * s * 2.6
            cy = py + uy * s * 2.6
            out.append(
                f'<line x1="{cx - nx * 4.2:.2f}" y1="{cy - ny * 4.2:.2f}" '
                f'x2="{cx + nx * 4.2:.2f}" y2="{cy + ny * 4.2:.2f}" '
                f'stroke="{MEASURE}" stroke-width="1"/>'
            )
    out.append(
        f'<line x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}" {A_MEAS}/>'
    )
    for (px, py), s in (((x1, y1), 1.0), ((x2, y2), -1.0)):
        bx, by = px + ux * s * head, py + uy * s * head
        if halo:
            out.append(
                f'<polygon points="{px:g},{py:g} {bx - nx * (hw + 1.4):.2f},{by - ny * (hw + 1.4):.2f} '
                f'{bx + nx * (hw + 1.4):.2f},{by + ny * (hw + 1.4):.2f}" fill="{HALO}" stroke="none"/>'
            )
        out.append(
            f'<polygon points="{px:g},{py:g} {bx - nx * hw:.2f},{by - ny * hw:.2f} '
            f'{bx + nx * hw:.2f},{by + ny * hw:.2f}" fill="{MEASURE}" stroke="none"/>'
        )
    return "".join(out)


def arrow_h(x1: float, x2: float, y: float, **kw) -> str:
    return arrow((x1, y), (x2, y), **kw)


def arrow_v(y1: float, y2: float, x: float, **kw) -> str:
    return arrow((x, y1), (x, y2), **kw)


def tape(x1: float, x2: float, y: float, h: float = 10.0) -> str:
    """Tape-measure band: white band with short perpendicular tick marks."""
    sag = min(3.0, (x2 - x1) * 0.03)
    top = f"M{x1:g},{y - h / 2:.2f} Q{(x1 + x2) / 2:g},{y - h / 2 - sag:.2f} {x2:g},{y - h / 2:.2f}"
    bottom = (
        f"Q{(x1 + x2) / 2:g},{y + h / 2 + sag:.2f} {x1:g},{y + h / 2:.2f}"
    )
    out = [f'<path d="{top} {bottom} Z" fill="{GARMENT}" stroke="{MEASURE}" '
           f'stroke-width="1.05" stroke-linejoin="round"/>']
    n = max(6, int((x2 - x1) / 7))
    for i in range(1, n):
        t = i / n
        x = x1 + (x2 - x1) * t
        yy = y - h / 2 - sag * 4 * t * (1 - t)
        yy2 = y + h / 2 + sag * 4 * t * (1 - t)
        long_tick = (i % 3 == 0)
        out.append(
            f'<line x1="{x:.2f}" y1="{yy + (1.6 if long_tick else 3.2):.2f}" '
            f'x2="{x:.2f}" y2="{yy2 - (1.6 if long_tick else 3.2):.2f}" {A_TAPE}/>'
        )
    return "".join(out)


# ===========================================================================
# garments
# ===========================================================================
# flat laid sweater, left half only (x <= 100)
FLAT_TOP = "M74,34 L42,50 C34,68 27,88 23,106 L37,116 L66,72 L63,140 L61,156 L100,156"
FLAT_HEM_TOP = 140
FLAT_HEM_BOT = 156
FLAT_SHOULDER = (42, 50)
FLAT_CUFF_OUT = (23, 106)
FLAT_CUFF_IN = (37, 116)
FLAT_COLLAR_O = ((74, 34), (100, 24), (126, 34))
FLAT_COLLAR_I = ((74, 34), (100, 60), (126, 34))


def flat_sweater() -> str:
    """Flat-laid crew-neck sweater - outline, collar, cuffs and hem ribbing."""
    body = mirrored_pair(FLAT_TOP)
    out = [path(body, A_GARMENT)]
    # neck hole
    out.append(path(f"M74,34 Q100,60 126,34", A_GARMENT.replace(f'fill="{GARMENT}"', 'fill="none"')))
    # collar ribbing
    out.append(hatch_q(*FLAT_COLLAR_O, *FLAT_COLLAR_I, 13))
    # hem band
    out.append(hatch_band((61, FLAT_HEM_TOP), (139, FLAT_HEM_TOP),
                           (61, FLAT_HEM_BOT), (139, FLAT_HEM_BOT), 20))
    # cuffs
    for sign in (-1, 1):
        ox, oy = FLAT_CUFF_OUT
        ix, iy = FLAT_CUFF_IN
        if sign < 0:
            ox, ix = 200 - ox, 200 - ix
        d = f"M{ox:g},{oy:g} L{ix:g},{iy:g}"
        out.append(path(d, A_RIB))
        # hatch across the cuff band
        dx, dy = ix - ox, iy - oy
        ln = math.hypot(dx, dy)
        nx, ny = -dy / ln, dx / ln
        band = 7.0
        for i in range(1, 5):
            t = i / 5
            bx = ox + dx * t
            by = oy + dy * t
            out.append(
                f'<line x1="{bx:.2f}" y1="{by:.2f}" x2="{bx + nx * band:.2f}" y2="{by + ny * band:.2f}" {A_RIB}/>'
            )
    # armhole seams
    out.append(path("M66,72 C74,80 78,92 80,104", A_RIB))
    out.append(path("M134,72 C126,80 122,92 120,104", A_RIB))
    return "".join(out)


# flat laid trousers, left half only
PANTS_TOP = "M62,58 L56,96 L70,140 L68,176 L92,176 L94,112 L100,100"
PANTS_WAIST_TOP = 44
PANTS_WAIST_BOT = 58


def flat_trousers() -> str:
    body = mirrored_pair(PANTS_TOP)
    out = [path(body, A_CLOTH)]
    # waistband
    out.append(path("M62,44 L138,44 L138,58 L62,58 Z", A_CLOTH))
    out.append(hatch_band((62, 44), (138, 44), (62, 58), (138, 58), 20))
    out.append(path("M62,58 L138,58", f'fill="none" stroke="{LINE}" stroke-width="{LINE_W}"'))
    # fly + centre seam
    out.append(path("M104,58 L104,100", A_RIB))
    # pockets
    out.append(path("M74,58 C72,72 66,84 60,92", A_RIB))
    out.append(path("M126,58 C128,72 134,84 140,92", A_RIB))
    # leg hems
    out.append(hatch_band((68, 166), (92, 166), (68, 176), (92, 176), 6))
    out.append(hatch_band((108, 166), (132, 166), (108, 176), (132, 176), 6))
    return "".join(out)


# ===========================================================================
# body figures
# ===========================================================================
BODY_TOP = "M54,46 L80,32"
BODY_COLLAR_O = ((80, 32), (100, 50), (120, 32))
BODY_COLLAR_I = ((86, 26), (100, 42), (114, 26))


def body_sweater() -> str:
    """Torso wearing a fine sweater: neck, ribbed collar, sleeves, hem."""
    out: list[str] = []
    # neck
    out.append(path("M86,6 L86,26 Q100,42 114,26 L114,6 Z", A_BODY))
    # torso / sweater body
    torso = (
        "M54,46 L80,32 Q100,50 120,32 L146,46 "
        "C136,66 132,92 132,120 L130,146 L128,164 L72,164 L70,146 L68,120 "
        "C68,92 64,66 54,46 Z"
    )
    out.append(path(torso, A_GARMENT))
    # sleeves (drawn over the torso, white fill keeps the arm seam readable)
    sleeve = (
        "M54,46 C48,66 44,96 41,130 L38,170 L52,174 "
        "C54,138 58,106 66,88 C64,72 60,56 54,46 Z"
    )
    out.append(path(sleeve, A_GARMENT))
    out.append(path(mirrored(sleeve), A_GARMENT))
    # sleeve cuffs
    for sign in (-1, 1):
        d = "M38,162 L52,166"
        if sign < 0:
            d = "M162,162 L148,166"
        out.append(path(d, A_RIB))
        for i in range(1, 5):
            t = i / 5
            x = 38 + 14 * t
            y = 162 + 4 * t
            if sign < 0:
                x = 200 - x
            out.append(f'<line x1="{x:.2f}" y1="{y:.2f}" x2="{x:.2f}" y2="{y + 8:.2f}" {A_RIB}/>')
    # collar ribbing
    out.append(hatch_q(*BODY_COLLAR_O, *BODY_COLLAR_I, 11))
    out.append(path("M80,32 Q100,50 120,32", f'fill="none" stroke="{LINE}" stroke-width="{LINE_W}"'))
    out.append(path("M86,26 Q100,42 114,26", f'fill="none" stroke="{LINE}" stroke-width="{LINE_W}"'))
    # hem ribbing
    out.append(hatch_band((70, 150), (130, 150), (72, 164), (128, 164), 15))
    out.append(path("M70,150 L130,150", A_RIB))
    # soft side seams
    out.append(path("M74,92 C78,108 78,128 76,146", A_RIB))
    out.append(path("M126,92 C122,108 122,128 124,146", A_RIB))
    return "".join(out)


LEGS_TOP = "M78,6 L76,24 L74,34 C66,45 60,62 58,84 C62,98 66,108 68,120 " \
           "C66,136 66,154 67,166 L67,172 L79,172 L78,120 L100,108"


def body_trousers() -> str:
    """Body from the waist down wearing slim trousers (soft beige figure)."""
    out: list[str] = []
    leg = mirrored(LEGS_TOP)
    out.append(path(leg, A_BODY))
    # trousers
    pants = (
        "M74,32 L126,32 L140,60 C144,74 144,84 138,96 "
        "C132,110 130,130 130,150 L129,166 L113,166 L112,120 L100,110 L88,120 "
        "L87,166 L71,166 L70,150 C70,130 68,110 62,96 C56,84 56,74 60,60 Z"
    )
    out.append(path(pants, A_CLOTH))
    # waistband
    out.append(path("M74,32 L126,32 L128,46 L72,46 Z", A_CLOTH))
    out.append(hatch_band((74, 32), (126, 32), (72, 46), (128, 46), 13))
    out.append(path("M72,46 L128,46", f'fill="none" stroke="{LINE}" stroke-width="{LINE_W}"'))
    # centre seam + fly
    out.append(path("M100,46 L100,110", A_RIB))
    out.append(path("M104,46 L104,108", A_RIB))
    # hip pockets
    out.append(path("M78,46 C80,62 84,76 90,86", A_RIB))
    out.append(path("M122,46 C120,62 116,76 110,86", A_RIB))
    # ankle cuffs
    for sign in (-1, 1):
        d = "M71,156 L87,156"
        if sign < 0:
            d = "M129,156 L113,156"
        out.append(path(d, A_RIB))
        for i in range(1, 4):
            t = i / 4
            x = 71 + 16 * t
            if sign < 0:
                x = 200 - x
            out.append(f'<line x1="{x:.2f}" y1="156" x2="{x:.2f}" y2="166" {A_RIB}/>')
    # feet
    foot = "M67,172 C64,180 58,186 55,191 C53,195 56,197 61,197 L77,197 " \
           "C80,197 81,194 80,190 L79,172 Z"
    out.append(path(foot, A_BODY))
    out.append(path(mirrored(foot), A_BODY))
    return "".join(out)


def standing_figure() -> str:
    """Simple full-length figure used for the height illustration."""
    out: list[str] = []
    out.append(path("M86,6 L86,26 Q100,42 114,26 L114,6 Z", A_BODY))
    out.append(f'<circle cx="100" cy="20" r="14" {A_BODY}/>')
    torso = (
        "M84,44 L116,44 C120,74 119,96 116,116 L118,150 L82,150 L84,116 "
        "C81,96 80,74 84,44 Z"
    )
    out.append(path(torso, A_BODY))
    # arms
    out.append(path("M84,48 C76,66 72,92 71,116 L78,117 C80,94 84,70 89,54 Z", A_BODY))
    out.append(path("M116,48 C124,66 128,92 129,116 L122,117 C120,94 116,70 111,54 Z", A_BODY))
    # legs
    out.append(path("M84,150 L99,150 L98,190 L86,190 Z", A_BODY))
    out.append(path("M101,150 L116,150 L114,190 L102,190 Z", A_BODY))
    out.append(path("M86,190 L99,190 L99,195 L84,195 Z", A_BODY))
    out.append(path("M101,190 L114,190 L116,195 L101,195 Z", A_BODY))
    return "".join(out)


def scale_figure() -> str:
    """Stylised figure standing on a bathroom scale."""
    out: list[str] = []
    out.append(f'<circle cx="100" cy="46" r="13" {A_BODY}/>')
    out.append(path("M88,60 L88,68 M112,60 L112,68", A_BODY))
    torso = "M88,66 C82,72 78,84 78,98 L82,116 L82,140 L118,140 L118,116 " \
            "L122,98 C122,84 118,72 112,66 Z"
    out.append(path(torso, A_BODY))
    out.append(path("M88,68 C92,74 108,74 112,68", A_BODY))
    # arms
    out.append(path("M86,72 C80,88 78,102 79,114 L85,114 C84,100 86,86 91,74 Z", A_BODY))
    out.append(path("M114,72 C120,88 122,102 121,114 L115,114 C116,100 114,86 109,74 Z", A_BODY))
    # legs
    out.append(path("M84,140 L99,140 L97,166 L86,166 Z", A_BODY))
    out.append(path("M101,140 L116,140 L114,166 L103,166 Z", A_BODY))
    # scale
    out.append(path("M56,162 L144,162 L144,182 C144,186 141,188 137,188 "
                    "L63,188 C59,188 56,186 56,182 Z", A_GARMENT))
    out.append(f'<circle cx="100" cy="174" r="9" fill="none" stroke="{LINE}" stroke-width="{LINE_W}"/>')
    out.append(f'<line x1="100" y1="174" x2="100" y2="168" {A_MEAS}/>')
    return "".join(out)


def flat_scarf_long() -> str:
    """A long scarf draped vertically."""
    out: list[str] = []
    body = "M74,22 C74,60 72,110 72,166 L128,166 C128,110 126,60 126,22 Z"
    out.append(path(body, A_GARMENT))
    out.append(path("M74,22 L126,22", f'fill="none" stroke="{LINE}" stroke-width="{LINE_W}"'))
    # folds
    out.append(path("M88,26 C86,70 86,120 86,166", A_RIB))
    out.append(path("M112,26 C114,70 114,120 114,166", A_RIB))
    # fringe
    for i in range(9):
        x = 74 + i * 6.5
        out.append(f'<line x1="{x:.1f}" y1="166" x2="{x - 1:.1f}" y2="180" {A_RIB}/>')
    return "".join(out)


def rolled_scarf() -> str:
    """A scarf folded into a soft roll - width is measured across it."""
    out: list[str] = []
    body = "M74,54 C70,86 70,128 74,160 L126,160 C130,128 130,86 126,54 Z"
    out.append(path(body, A_GARMENT))
    out.append(f'<ellipse cx="100" cy="54" rx="26" ry="9" fill="{GARMENT}" '
               f'stroke="{LINE}" stroke-width="{LINE_W}"/>')
    out.append(f'<ellipse cx="100" cy="54" rx="15" ry="5" fill="none" stroke="{RIBBING}" stroke-width="{RIBBING_W}"/>')
    out.append(f'<path d="M85,54 C85,50 115,50 115,54" fill="none" stroke="{RIBBING}" stroke-width="{RIBBING_W}"/>')
    out.append(path("M74,160 C84,166 116,166 126,160", f'fill="none" stroke="{LINE}" stroke-width="{LINE_W}"'))
    # rolled edge on the side
    out.append(path("M78,60 C76,90 76,128 79,156", A_RIB))
    out.append(path("M122,60 C124,90 124,128 121,156", A_RIB))
    return "".join(out)


# ===========================================================================
# svg assembly
# ===========================================================================
def svg(body: str, title: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
        f'width="{W}" height="{H}" preserveAspectRatio="xMidYMid meet" '
        f'role="img" aria-label="{title}">\n'
        f'  <title>{title}</title>\n'
        f'  {body}\n'
        f'</svg>\n'
    )


def build() -> dict[str, str]:
    out: dict[str, str] = {}

    # --- chest (body measurement) ---------------------------------------
    out["chest.svg"] = svg(body_sweater() + tape(60, 140, 100), "胸围")

    # --- height ----------------------------------------------------------
    out["height.svg"] = svg(
        standing_figure()
        + f'<line x1="26" y1="196" x2="186" y2="196" {A_MEAS}/>'
        + arrow_v(8, 196, 178),
        "身高",
    )

    # --- weight ----------------------------------------------------------
    out["weight.svg"] = svg(scale_figure(), "体重")

    # --- shoulder (body) ---------------------------------------------------
    out["shoulder_body.svg"] = svg(
        body_sweater() + arrow_h(54, 146, 46), "肩宽（身体）"
    )

    # --- shoulder (flat garment) -------------------------------------------
    out["shoulder_flat.svg"] = svg(
        flat_sweater() + arrow_h(42, 158, 50), "肩宽（平铺）"
    )

    # --- chest width (flat garment) ----------------------------------------
    out["chest_flat.svg"] = svg(
        flat_sweater() + arrow_h(64, 136, 102), "胸围（平铺）"
    )

    # --- length (flat garment) ----------------------------------------------
    out["length.svg"] = svg(
        flat_sweater() + arrow_v(50, 156, 152), "衣长"
    )

    # --- sleeve (flat garment) ------------------------------------------------
    out["sleeve.svg"] = svg(
        flat_sweater() + arrow((124, 34), (176, 108)), "袖长"
    )

    # --- waist (body) ----------------------------------------------------------
    out["waist.svg"] = svg(body_sweater() + tape(66, 134, 126), "腰围")

    # --- hip (body) -------------------------------------------------------------
    out["hip.svg"] = svg(body_trousers() + tape(56, 144, 74), "臀围")

    # --- waist (flat garment) ----------------------------------------------------
    out["waist_flat.svg"] = svg(
        flat_trousers() + arrow_h(62, 138, 51), "腰围（平铺）"
    )

    # --- hip (flat garment) --------------------------------------------------------
    out["hip_flat.svg"] = svg(
        flat_trousers() + arrow_h(56, 144, 88), "臀围（平铺）"
    )

    # --- neck ------------------------------------------------------------------------
    neck = (
        "M78,6 L78,54 C70,62 62,72 56,86 L44,120 L56,124 L72,96 L70,150 "
        "L130,150 L128,96 L144,124 L156,120 L144,86 C138,72 130,62 122,54 L122,6 Z"
    )
    out["neck.svg"] = svg(
        path("M88,6 L88,48 Q100,66 112,48 L112,6 Z", A_BODY)
        + path(neck, A_GARMENT)
        + hatch_q((84, 46), (100, 70), (116, 46), (88, 48), (100, 66), (112, 48), 11)
        + path("M84,46 Q100,70 116,46", f'fill="none" stroke="{LINE}" stroke-width="{LINE_W}"')
        + arrow_h(84, 116, 58),
        "颈围",
    )

    # --- scarf length ------------------------------------------------------------------
    out["scarf_length.svg"] = svg(
        flat_scarf_long() + arrow_v(24, 176, 164), "围巾长度"
    )

    # --- scarf width --------------------------------------------------------------------
    out["scarf_width.svg"] = svg(
        rolled_scarf() + arrow_h(74, 126, 44), "围巾宽度"
    )

    return out


def main() -> int:
    with C.Stage("21_measure_illustrations") as stage:
        OUT.mkdir(parents=True, exist_ok=True)
        files = build()
        for name, content in files.items():
            (OUT / name).write_text(content, "utf-8")
        stage.log(f"wrote {len(files)} illustrations to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
