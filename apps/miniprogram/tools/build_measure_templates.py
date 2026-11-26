#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 prototype/data/measurement_templates.json 转成小程序可编译的 TS 数据模块。

输出：apps/miniprogram/data/measure_templates.ts
字段命名与 packages/contracts 的 MeasurementTemplateDto / MeasurementSection /
MeasurementField 保持一致（camelCase），以便直接复用契约类型。

用法：python3 apps/miniprogram/tools/build_measure_templates.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "prototype" / "data" / "measurement_templates.json"
OUT = ROOT / "apps" / "miniprogram" / "data" / "measure_templates.ts"

# 契约里的枚举是字符串枚举，字面量字符串不能直接赋给枚举类型，这里输出枚举成员
MEASURE_TYPE = {
    "body": "MeasurementType.BODY",
    "garment_flat": "MeasurementType.GARMENT_FLAT",
}


def field(src: dict) -> dict:
    return {
        "fieldCode": src.get("field_code"),
        "fieldName": src.get("field_name"),
        "measurementType": MEASURE_TYPE.get(src.get("measurement_type"), "MeasurementType.BODY"),
        "unit": src.get("unit"),
        "required": bool(src.get("required")),
        "instruction": src.get("instruction") or "",
        "tips": list(src.get("tips") or []),
        # 只保留文件名：示意图实际来自小程序内置 PNG（见 utils/guide.ts resolveIllustration）
        "illustration": (src.get("illustration") or "").split("/")[-1] or None,
        "min": src.get("min"),
        "max": src.get("max"),
        "step": src.get("step"),
    }


def section(src: dict) -> dict:
    return {
        "sectionId": src.get("section_id"),
        "title": src.get("title"),
        "measurementType": MEASURE_TYPE.get(src.get("measurement_type"), "MeasurementType.BODY"),
        "description": src.get("description") or "",
        "measurementFields": [field(f) for f in (src.get("measurement_fields") or [])],
    }


def template(src: dict) -> dict:
    return {
        "id": src.get("template_id"),
        "code": src.get("template_id"),
        "name": src.get("template_name"),
        "version": 1,
        "status": "TemplateStatus.ACTIVE",
        "applicableCategories": list(src.get("applicable_category") or []),
        "summary": src.get("summary") or "",
        "measurementSections": [section(s) for s in (src.get("measurement_sections") or [])],
    }


def main() -> None:
    raw = json.loads(SRC.read_text(encoding="utf-8"))
    templates = [template(t) for t in raw.get("templates", [])]
    body = json.dumps(templates, ensure_ascii=False, indent=2)
    # 枚举成员需输出为可执行标识符，而不是字符串字面量
    for marker in ("MeasurementType.BODY", "MeasurementType.GARMENT_FLAT", "TemplateStatus.ACTIVE"):
        body = body.replace('"%s"' % marker, marker)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        "/**\n"
        " * 量体模板本地兜底数据（由 tools/build_measure_templates.py 从 prototype/data 生成）。\n"
        " *\n"
        " * 用途：图文指南页在接口未返回内容时，仍能展示量体字段与测量说明；\n"
        " * 字段结构与 packages/contracts 的 MeasurementTemplateDto 一致。\n"
        " */\n"
        "import { MeasurementTemplateDto, MeasurementType, TemplateStatus } from '../types/contracts';\n\n"
        "export const MEASURE_TEMPLATES: MeasurementTemplateDto[] = " + body + ";\n",
        encoding="utf-8",
    )
    print("已生成:", OUT)


if __name__ == "__main__":
    main()
