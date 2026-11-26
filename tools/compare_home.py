"""Side-by-side comparison: ref screenshots vs current prototype.

Usage: python3 tools/compare_home.py
Writes /tmp/cmp_*.png (left = ref, right = prototype).
"""
from __future__ import annotations

import http.server
import pathlib
import socketserver
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8765/prototype"


def stack(ref_name: str, proto_png: str, out: str, crop=None):
    a = Image.open(ROOT / "ref" / ref_name).convert("RGB")
    b = Image.open(proto_png).convert("RGB")
    w = 520
    a = a.resize((w, round(a.height * w / a.width)), Image.LANCZOS)
    b = b.resize((w, round(b.height * w / b.width)), Image.LANCZOS)
    if crop:
        a = a.crop(crop)
        b = b.crop((0, crop[1], w, crop[3]))
    h = max(a.height, b.height)
    canvas = Image.new("RGB", (w * 2 + 16, h), "#333333")
    canvas.paste(a, (0, 0))
    canvas.paste(b, (w + 16, 0))
    canvas.save(out)
    print("wrote", out)


def main() -> int:
    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(ROOT), **kw)

        def log_message(self, *a):
            pass

    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", 8765), H)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 390, "height": 844},
                            device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = ctx.new_page()

        def scroll_all():
            pg.evaluate("""async () => {
                const step = window.innerHeight;
                for (let y = 0; y < document.body.scrollHeight; y += step) {
                    window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60));
                }
                window.scrollTo(0, 0);
            }""")
            pg.wait_for_timeout(400)

        # 首页
        pg.goto(f"{BASE}/index.html", wait_until="networkidle")
        pg.wait_for_timeout(600)
        scroll_all()
        pg.screenshot(path="/tmp/p_home_full.png", full_page=True)
        pg.evaluate("""() => {
            const el = Array.from(document.querySelectorAll('.mod-title .t'))
                .find(e => e.textContent.trim() === '量体定制');
            window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60);
        }""")
        pg.wait_for_timeout(400)
        pg.screenshot(path="/tmp/p_home_guide.png")

        # 分类页
        pg.goto(f"{BASE}/category.html?c=knitwear", wait_until="networkidle")
        pg.wait_for_timeout(700)
        pg.screenshot(path="/tmp/p_cat.png")
        pg.goto(f"{BASE}/category.html?c=clothing&g=bottoms", wait_until="networkidle")
        pg.wait_for_timeout(700)
        pg.screenshot(path="/tmp/p_cat_group.png")

        ctx.close()
        b.close()
    httpd.shutdown()

    stack("首页1.png", "/tmp/p_home_full.png", "/tmp/cmp_home1.png")
    stack("首页4.png", "/tmp/p_home_guide.png", "/tmp/cmp_home4.png")
    stack("分类页1.png", "/tmp/p_cat.png", "/tmp/cmp_cat.png")
    stack("分类页2.png", "/tmp/p_cat_group.png", "/tmp/cmp_cat2.png")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
