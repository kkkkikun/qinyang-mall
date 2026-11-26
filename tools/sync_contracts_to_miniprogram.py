#!/usr/bin/env python3
"""
把共享契约同步到微信小程序目录。

微信开发者工具只能编译小程序根目录内的文件，无法直接引用 `packages/contracts`，
因此小程序内保留一份**自包含、无 import**的契约副本。

本脚本做两件事：
1. 校验副本与源文件是否一致（允许仅注释差异 —— 副本可能带本地说明）；
2. 不一致时用源文件覆盖副本。

用法：python3 tools/sync_contracts_to_miniprogram.py [--check]
"""

from __future__ import annotations

import argparse
import difflib
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SOURCE = REPO / "packages" / "contracts" / "src" / "index.ts"
TARGET = REPO / "apps" / "miniprogram" / "types" / "contracts.ts"

HEADER = """/**
 * 本文件是 `packages/contracts/src/index.ts` 的**同步副本**。
 *
 * 微信开发者工具只能编译小程序根目录内的文件，无法直接引用工作区其他目录，
 * 因此这里保留一份自包含副本。
 *
 * 禁止手工修改：请改 `packages/contracts/src/index.ts` 后运行
 * `python3 tools/sync_contracts_to_miniprogram.py` 重新生成。
 *
 * 生成时间：{stamp}
 */
"""


def strip_comments(text: str) -> str:
    """去掉注释与空行，只比较有效代码 —— 允许副本带本地头部注释。"""
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"//[^\n]*", "", text)
    return "\n".join(line.rstrip() for line in text.splitlines() if line.strip())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="只校验是否同步，不写入",
    )
    args = parser.parse_args()

    if not SOURCE.exists():
        print(f"缺少源文件：{SOURCE}", file=sys.stderr)
        return 1

    source_text = SOURCE.read_text(encoding="utf-8")
    target_text = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""

    if strip_comments(source_text) == strip_comments(target_text):
        print("✅ 小程序契约副本与源文件一致")
        return 0

    if args.check:
        print("❌ 小程序契约副本与源文件不一致，请运行：")
        print("   python3 tools/sync_contracts_to_miniprogram.py")
        diff = list(
            difflib.unified_diff(
                strip_comments(target_text).splitlines(),
                strip_comments(source_text).splitlines(),
                fromfile="miniprogram/types/contracts.ts",
                tofile="packages/contracts/src/index.ts",
                lineterm="",
            )
        )
        for line in diff[:40]:
            print(f"   {line}")
        return 1

    from datetime import datetime

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    TARGET.write_text(
        HEADER.format(stamp=stamp) + "\n" + source_text,
        encoding="utf-8",
    )
    print(f"✅ 已同步：{SOURCE.relative_to(REPO)} → {TARGET.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
