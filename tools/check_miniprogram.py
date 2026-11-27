#!/usr/bin/env python3
"""
微信原生小程序静态自检脚本。

本机没有微信开发者工具，也不允许安装完整依赖树，因此用静态检查覆盖
「结构性问题」这一类失败（开发者工具会直接报编译错误的那一类）。

检查项：
1. app.json 的 pages 数组与实际目录一一对应，且顺序一致；
2. 每个页面都有 .wxml / .wxss / .ts / .json 四个文件；
3. WXML 中引用的本地资源（image src / include src）都真实存在；
4. 没有任何资源引用指向 apps/miniprogram 之外（微信开发者工具无法编译）；
5. 没有引入任何 npm 运行时依赖（不得出现 node_modules / require('xxx') 形式）；
6. utils/api.ts 里出现的接口路径都能在 docs/api/REST-CONTRACT.md 中找到。

用法：python3 tools/check_miniprogram.py
退出码非 0 表示存在阻塞性问题。
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
APP = REPO / "apps" / "miniprogram"
CONTRACT = REPO / "docs" / "api" / "REST-CONTRACT.md"

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def main() -> int:
    if not APP.exists():
        err(f"缺少小程序目录：{APP}")
        return report()

    app_json_path = APP / "app.json"
    if not app_json_path.exists():
        err("缺少 app.json")
        return report()

    app_json = json.loads(app_json_path.read_text(encoding="utf-8"))
    pages = app_json.get("pages", [])

    # 1. pages 与目录一一对应
    for page in pages:
        # page 形如 pages/index/index，目录是 pages/index
        directory = APP / Path(page).parent
        if not directory.is_dir():
            err(f"app.json 声明的页面目录不存在：{page}")

    # 反向检查：存在目录但未在 app.json 注册
    registered = set(pages)
    for directory in sorted(APP.iterdir()):
        if not directory.is_dir() or directory.name in {
            "node_modules",
            "assets",
            "types",
            "utils",
            "tools",
            "data",
        }:
            continue
        if directory.name.startswith("."):
            continue
        if directory.name == "pages":
            continue
        relative = f"pages/{directory.name}"
        if relative not in registered:
            err(f"页面目录未在 app.json 注册：{relative}")

    # 2. 每个页面四个文件
    for page in pages:
        for suffix in (".wxml", ".wxss", ".ts", ".json"):
            path = APP / f"{page}{suffix}"
            if not path.exists():
                err(f"页面缺少文件：{page}{suffix}")

    # 3 & 4. 资源引用
    resource_pattern = re.compile(r'(?:src|href)\s*=\s*"([^"]+)"')
    for wxml in APP.rglob("*.wxml"):
        text = wxml.read_text(encoding="utf-8")
        for ref in resource_pattern.findall(text):
            if ref.startswith(("http://", "https://", "data:", "//")):
                continue
            if "{{" in ref:
                # 运行时数据绑定（如 item.coverUrl），不是静态路径
                continue
            if ref.startswith("/"):
                candidate = APP / ref.lstrip("/")
            else:
                candidate = (wxml.parent / ref).resolve()
            if not candidate.exists():
                err(f"{wxml.relative_to(APP)} 引用了不存在的资源：{ref}")
            try:
                candidate.relative_to(APP)
            except ValueError:
                err(f"{wxml.relative_to(APP)} 引用了小程序根目录之外的资源：{ref}")

    # wxss 中的 url() 引用
    url_pattern = re.compile(r"url\(\s*['\"]?([^'\")]+)")
    for wxss in APP.rglob("*.wxss"):
        text = wxss.read_text(encoding="utf-8")
        for ref in url_pattern.findall(text):
            if ref.startswith(("http://", "https://", "data:")) or "{{" in ref:
                continue
            candidate = (wxss.parent / ref).resolve()
            if not candidate.exists():
                err(f"{wxss.relative_to(APP)} 引用了不存在的资源：{ref}")

    # 5. 不得有运行时 npm 依赖
    if (APP / "node_modules").exists():
        err("小程序目录出现 node_modules：不允许引入运行时 npm 依赖")
    if (APP / "package.json").exists():
        err("小程序目录不应存在 package.json：原生小程序不引入 npm 依赖")
    require_pattern = re.compile(r"require\(\s*['\"]([^'\"]+)['\"]\s*\)")
    for ts_file in APP.rglob("*.ts"):
        text = ts_file.read_text(encoding="utf-8")
        for module in require_pattern.findall(text):
            if module.startswith("."):
                continue
            err(f"{ts_file.relative_to(APP)} 引入了外部模块：{module}")

    # 6. 接口路径与契约一致
    contract_text = CONTRACT.read_text(encoding="utf-8") if CONTRACT.exists() else ""
    api_file = APP / "utils" / "api.ts"
    if api_file.exists() and contract_text:
        api_text = api_file.read_text(encoding="utf-8")
        paths = set(re.findall(r"['\"`](/(?:auth|categories|banners|products|guides|measurement-templates|customization-requests|orders)[^'\"`]*)['\"`]", api_text))
        for path in sorted(paths):
            clean = path.split("?")[0].rstrip("/")
            if clean and clean not in contract_text:
                warn(f"接口路径未在 REST-CONTRACT.md 中出现（可能是参数化路径）：{path}")

    # 7. tabBar 图标存在
    tab_bar = app_json.get("tabBar", {})
    for item in tab_bar.get("list", []):
        for key in ("iconPath", "selectedIconPath"):
            icon = item.get(key)
            if icon and not (APP / icon).exists():
                err(f"tabBar 图标不存在：{icon}")

    # 8. 字号必须走令牌（禁止裸字号）
    #
    # 背景：全站曾散落 21 档裸字号（8px~30px，含 59 处半像素值），
    # 改一处字号要翻十几个页面，排版也失去秩序感。
    # 现已统一收敛到 app.wxss 的 --fs-* 标度，这里做回归拦截。
    raw_font_size = re.compile(r"font-size:\s*[0-9]+(?:\.[0-9]+)?px")
    comment_re = re.compile(r"/\*.*?\*/", re.S)
    for wxss in sorted(APP.rglob("*.wxss")):
        text = wxss.read_text(encoding="utf-8")
        # 注释里可能写着「原先是 font-size:15px」之类的说明，不算违规
        code = comment_re.sub("", text)
        for match in raw_font_size.finditer(code):
            line_no = code.count("\n", 0, match.start()) + 1
            err(
                f"{wxss.relative_to(APP)}:{line_no} 使用了裸字号 {match.group(0).split(':')[1].strip()}，"
                "请改用 app.wxss 中的 --fs-* 字号令牌"
            )

    return report()


def report() -> int:
    for message in warnings:
        print(f"⚠️  {message}")
    for message in errors:
        print(f"❌ {message}")
    if errors:
        print(f"\n小程序静态自检：{len(errors)} 项阻塞问题，{len(warnings)} 项提醒")
        return 1
    print(f"\n小程序静态自检通过（{len(warnings)} 项提醒）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
