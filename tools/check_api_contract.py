#!/usr/bin/env python3
"""
前后端接口路径 × API 路由表 交叉核对脚本。

背景：
顾客端（小程序）、管理后台（Vue）、API（NestJS）由不同批次实现，
最容易出的静默缺陷是「前端调用的路径或方法在 API 里并不存在」——
页面能打开、编译能通过，只有点下去才会 404。

本脚本直接以 **API 控制器源码** 为事实来源（而不是手写的文档），
生成路由表，再反向核对两个前端 API 层的每一次调用：

1. API 侧：解析 `@Controller('x')` + `@Get/@Post/@Put/@Patch/@Delete('y')`，
   叠加全局前缀 `api/v1`，得到 (METHOD, PATH) 路由表；
2. 小程序侧：解析 `apps/miniprogram/utils/api.ts` 中的 `url:` 表达式；
3. 后台侧：解析 `apps/admin-web/src/api/admin.ts` 中的 `url:` + `method:`；
4. 比对：路径段数一致、字面量段相等、参数段互配；方法必须一致。

另外检查：API 路由是否都在 `docs/api/REST-CONTRACT.md` 中登记（防止文档过期）。

用法：python3 tools/check_api_contract.py
退出码非 0 表示存在阻塞性问题（前端调用了 API 不存在的端点）。
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
API_SRC = REPO / "apps" / "api" / "src"
MINI_API = REPO / "apps" / "miniprogram" / "utils" / "api.ts"
ADMIN_API = REPO / "apps" / "admin-web" / "src" / "api" / "admin.ts"
CONTRACT = REPO / "docs" / "api" / "REST-CONTRACT.md"

GLOBAL_PREFIX = "api/v1"

errors: list[str] = []
warnings: list[str] = []
notes: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def note(msg: str) -> None:
    notes.append(msg)


# --------------------------------------------------------------------------
# API 侧：路由表
# --------------------------------------------------------------------------

CONTROLLER_RE = re.compile(r"@Controller\(\s*(?:'([^']*)'|\"([^\"]*)\")?\s*\)")
METHOD_RE = re.compile(r"@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)'|\"([^\"]*)\")?\s*\)")


def build_api_routes() -> dict[tuple[str, str], str]:
    """返回 {(METHOD, PATH): 控制器文件}"""
    routes: dict[tuple[str, str], str] = {}
    for controller in sorted(API_SRC.rglob("*.controller.ts")):
        text = controller.read_text(encoding="utf-8")
        lines = text.splitlines()
        current_prefix: str | None = None
        for line in lines:
            ctrl = CONTROLLER_RE.search(line)
            if ctrl:
                current_prefix = ctrl.group(1) if ctrl.group(1) is not None else (ctrl.group(2) or "")
                continue
            m = METHOD_RE.search(line)
            if not m or current_prefix is None:
                continue
            verb = m.group(1).upper()
            sub = m.group(2) if m.group(2) is not None else (m.group(3) or "")
            parts = [p for p in (current_prefix.strip("/"), sub.strip("/")) if p]
            path = "/" + "/".join(parts)
            routes[(verb, path)] = controller.relative_to(REPO).as_posix()
    return routes


# --------------------------------------------------------------------------
# 前端侧：调用提取
# --------------------------------------------------------------------------

URL_PROP_RE = re.compile(r"\burl\s*:\s*")
METHOD_PROP_RE = re.compile(r"\bmethod\s*:\s*['\"]([A-Za-z]+)['\"]")


def _read_string_literal(text: str, start: int) -> tuple[str, int] | None:
    """从 start 读取一个字符串字面量（'...' 或 "..."），返回 (内容, 结束位置)。"""
    if start >= len(text) or text[start] not in "'\"":
        return None
    quote = text[start]
    index = start + 1
    buf: list[str] = []
    while index < len(text):
        char = text[index]
        if char == "\\":
            index += 2
            continue
        if char == quote:
            return "".join(buf), index + 1
        buf.append(char)
        index += 1
    return None


def _read_template_literal(text: str, start: int) -> tuple[list[str], int] | None:
    """读取 `...`，把 ${...} 拆成独立的段，返回 ([段...], 结束位置)。"""
    if start >= len(text) or text[start] != "`":
        return None
    index = start + 1
    segments: list[str] = []
    buf: list[str] = []
    while index < len(text):
        char = text[index]
        if char == "\\":
            index += 2
            continue
        if char == "`":
            segments.append("".join(buf))
            return segments, index + 1
        if text.startswith("${", index):
            segments.append("".join(buf))
            buf = []
            depth = 1
            index += 2
            while index < len(text) and depth:
                if text[index] == "{":
                    depth += 1
                elif text[index] == "}":
                    depth -= 1
                index += 1
            segments.append(":expr")
            continue
        buf.append(char)
        index += 1
    return None


def _enclosing_object(text: str, index: int) -> tuple[int, int]:
    """返回 index 所在对象字面量的 (起点, 终点) 区间。

    `url:` 与 `method:` 在同一个对象字面量里，但书写顺序不固定
    （小程序是 url 在前，axios 封装是 method 在前），因此必须先定位对象边界。
    """
    start = -1
    depth = 0
    pos = index
    while pos >= 0:
        char = text[pos]
        if char == "}":
            depth += 1
        elif char == "{":
            if depth == 0:
                start = pos
                break
            depth -= 1
        pos -= 1
    if start < 0:
        return (0, len(text))
    depth = 0
    end = len(text)
    pos = start
    while pos < len(text):
        char = text[pos]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = pos
                break
        pos += 1
    return (start, end)


def extract_calls(text: str, default_method: str) -> list[tuple[str, str, int]]:
    """提取 (METHOD, PATH_PATTERN, 行号)。PATH_PATTERN 中的 :expr 表示通配段。"""
    calls: list[tuple[str, str, int]] = []
    for match in URL_PROP_RE.finditer(text):
        line_no = text.count("\n", 0, match.start()) + 1
        # method 与 url 同属一个对象字面量，必须在对象边界内查找
        obj_start, obj_end = _enclosing_object(text, match.start())
        block = text[obj_start:obj_end]
        methods = METHOD_PROP_RE.findall(block)
        method = methods[-1].upper() if methods else default_method.upper()

        pos = match.end()
        while pos < len(text) and text[pos] in " \t":
            pos += 1

        segments: list[str] = []
        ok = False
        if pos < len(text) and text[pos] in "'\"":
            literal = _read_string_literal(text, pos)
            if literal:
                ok = True
                value, end = literal
                segments = [s for s in value.split("/") if s != ""]
                # 字符串拼接：'+ expr'，可能有多段（路径前缀 + 参数 + 路径后缀）
                tail = text[end:]
                while True:
                    stripped = tail.lstrip()
                    if not stripped.startswith("+"):
                        break
                    tail = stripped[1:].lstrip()
                    if not tail:
                        break
                    if tail[0] in "'\"":
                        lit = _read_string_literal(tail, 0)
                        if lit is None:
                            break
                        suffix, pos = lit
                        segments.extend(s for s in suffix.split("/") if s)
                        tail = tail[pos:]
                        continue
                    term_match = re.match(r"[A-Za-z_$][\w$]*", tail)
                    if not term_match:
                        break
                    name = term_match.group(0)
                    tail = tail[term_match.end():]
                    # 跳过可能存在的函数调用实参
                    paren = tail.find("(")
                    if paren != -1:
                        depth = 0
                        cursor = paren
                        while cursor < len(tail):
                            if tail[cursor] == "(":
                                depth += 1
                            elif tail[cursor] == ")":
                                depth -= 1
                                if depth == 0:
                                    cursor += 1
                                    break
                            cursor += 1
                        tail = tail[cursor:]
                    if name == "qs" or name.startswith("qs"):
                        # 查询串拼接，不产生路径段
                        continue
                    # 路径段拼接：视为通配参数
                    segments.append(":expr")
        elif pos < len(text) and text[pos] == "`":
            template = _read_template_literal(text, pos)
            if template:
                ok = True
                parts, _ = template
                for part in parts:
                    for seg in part.split("/"):
                        if seg:
                            segments.append(seg)
        if not ok or not segments:
            continue
        calls.append((method, "/" + "/".join(segments), line_no))
    return calls


# --------------------------------------------------------------------------
# 比对
# --------------------------------------------------------------------------


def route_matches(route: str, pattern: str) -> bool:
    route_parts = [p for p in route.split("/") if p]
    pattern_parts = [p for p in pattern.split("/") if p]
    if len(route_parts) != len(pattern_parts):
        return False
    for route_part, pattern_part in zip(route_parts, pattern_parts):
        route_is_param = route_part.startswith(":")
        pattern_is_param = pattern_part.startswith(":")
        if route_is_param and pattern_is_param:
            continue
        if route_is_param or pattern_is_param:
            continue
        if route_part != pattern_part:
            return False
    return True


def main() -> int:
    if not API_SRC.exists():
        err(f"缺少 API 源码目录：{API_SRC}")
        return report()
    if not MINI_API.exists():
        err(f"缺少小程序 API 层：{MINI_API}")
        return report()
    if not ADMIN_API.exists():
        err(f"缺少后台 API 层：{ADMIN_API}")
        return report()

    routes = build_api_routes()
    if not routes:
        err("未能从 API 控制器解析出任何路由（解析规则可能失效）")
        return report()
    note(f"API 路由表：{len(routes)} 条（来源：apps/api/src/**/*.controller.ts）")

    used: set[tuple[str, str]] = set()

    for label, path, default_method in (
        ("小程序", MINI_API, "GET"),
        ("管理后台", ADMIN_API, "GET"),
    ):
        text = path.read_text(encoding="utf-8")
        calls = extract_calls(text, default_method)
        if not calls:
            err(f"{label} 未解析出任何接口调用（解析规则可能失效）")
            continue
        note(f"{label}接口调用：{len(calls)} 处")
        for method, pattern, line_no in calls:
            matched = [
                route
                for (verb, route) in routes
                if verb == method and route_matches(route, pattern)
            ]
            if not matched:
                # 再放宽到只看路径，区分「路径不存在」与「方法不对」
                path_only = [route for (_verb, route) in routes if route_matches(route, pattern)]
                relative = path.relative_to(REPO).as_posix()
                if path_only:
                    err(
                        f"{label} {relative}:{line_no} 调用 {method} {pattern}，"
                        f"API 只有同路径的其他方法：{sorted(path_only)}"
                    )
                else:
                    err(f"{label} {relative}:{line_no} 调用 {method} {pattern}，API 中不存在该路由")
            else:
                used.add((method, matched[0]))

    # API 路由是否登记在契约文档里
    if CONTRACT.exists():
        contract_text = CONTRACT.read_text(encoding="utf-8")
        for (verb, route) in sorted(routes):
            if route in {"/health", "/docs"}:
                continue
            if route not in contract_text:
                warn(f"API 路由 {verb} /{GLOBAL_PREFIX}{route} 未登记在 REST-CONTRACT.md")

    # 前端从未调用的路由（仅提示，避免误报：Swagger / 预留能力）
    unused = [
        (verb, route)
        for (verb, route) in sorted(routes)
        if (verb, route) not in used and route not in {"/health", "/docs"}
    ]
    if unused:
        note(
            "以下 API 路由当前无前端调用（可能为后台预留能力，非错误）："
            + "、".join(f"{verb} {route}" for verb, route in unused)
        )

    return report()


def report() -> int:
    for message in notes:
        print(f"ℹ️  {message}")
    for message in warnings:
        print(f"⚠️  {message}")
    for message in errors:
        print(f"❌ {message}")
    if errors:
        print(f"\n接口契约核对：{len(errors)} 项阻塞问题，{len(warnings)} 项提醒")
        return 1
    print(f"\n接口契约核对通过（{len(warnings)} 项提醒）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
