"""Write catalog/README.md - structure, parameters, and how to re-run."""
from __future__ import annotations

import csv
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common as C


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def dir_size(p: Path) -> int:
    if not p.exists():
        return 0
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())


def main() -> int:
    with C.Stage("12_readme") as stage:
        C.ensure_dirs()
        inv = C.load_cache("inventory.json")
        rows = C.load_cache("catalog_rows.json").get("products", [])
        src_bytes = sum(r.get("file_size_bytes", 0) for r in inv.values())
        out_bytes = dir_size(C.CATALOG_DIR / "products")
        thumb_bytes = dir_size(C.CATALOG_DIR / "products")

        cats: dict[str, int] = {}
        for r in rows:
            cats[r["category"]] = cats.get(r["category"], 0) + 1

        md = f"""# 鄂多蘭 商品数字资产库 (catalog)

本目录是由 `images/` 原始素材派生的**标准化商品数字资产库**，可直接用于微信小程序商城上架、
商品图库管理与后续 AI 模特生成。

> 原始素材目录 `images/` 为**只读**：本次处理未删除、覆盖、重命名或移动其中任何文件，
> 所有产物均写入 `catalog/`。

## 目录结构

```
catalog/
├── README.md                      本文件
├── products/                      逐商品资产目录（ED-XXXX 为临时资产编号，非真实 SKU）
│   └── ED-0001/
│       ├── original/              原图来源指针（source_paths.txt，不复制 10GB 原图）
│       ├── processed/             商品原图展示版本（原始分辨率、原始比例、无裁切）
│       ├── thumbnails/            小程序缩略图版本（长边 600px）
│       └── display/               统一展示比例副本（1:1 / 4:5，补边不裁切）
├── categories/                    按类别建立的索引（index.json，指向封面与商品目录）
│   ├── shirts/ scarves/ knitwear/ clothing/ accessories/ unknown/
├── ai-ready/                      AI 模特生成素材准备区（本阶段不生成任何 AI 图片）
│   ├── reference/                 参考图候选池与准备度评估
│   └── approved/                  人工审核通过的 AI 素材（当前为空）
├── reports/                       所有数据清单与报告
│   ├── image_inventory.csv        全量图片盘点
│   ├── inventory_summary.md       盘点摘要
│   ├── product_catalog.csv        商品清单
│   ├── image_manifest.json        结构化清单（TypeScript 可直接读取）
│   ├── duplicate_report.csv       完全重复 / 疑似重复
│   ├── uncertain_groups.csv       不确定分组（待人工确认）
│   ├── quality_report.csv         图片质量检测
│   └── logs/                      各阶段处理日志
└── review/
    ├── index.html                 人工审核页面（浏览器直接打开）
    ├── authored_overrides.json    视觉复核写入的标注结果
    ├── review_schema.json         导出文件字段说明
    ├── contact_sheets/            分类联络表
    └── product_sheets/            逐商品联络表
```

## 关键处理参数

| 项目 | 参数 |
| --- | --- |
| 展示版本 (processed) | JPEG quality 90, 4:4:4 无色度抽样, 保留原始分辨率与宽高比, 不裁切 |
| 缩略图 (thumbnails) | 长边 600px, JPEG quality 82, 不放大小分辨率原图 |
| 展示比例副本 (display) | 1:1 与 4:5, 以图片自身边框主色补边, 商品完整不裁切 |
| 感知哈希 | pHash / dHash / aHash 64bit (本地 DCT 实现, 无外部依赖) |
| 近重复判定 | pHash 距离 ≤ 8 且 dHash 距离 ≤ 8 → 进入疑似重复清单 |
| 商品分组 | 源文件夹结构为主, 图像向量相似度为辅; 不确定关系保留待人工确认 |
| 主图选择 | 商品完整度 + 清晰度 + 构图 + 背景 + 曝光综合评分, 不以文件大小为准 |

## 数据口径说明

* `ED-XXXX` 为**临时数字资产编号**, 不代表客户真实 SKU。
* `material` / `price` / `stock` / `sizes` 全部留空: 素材无法可靠确认这些经营数据, 不做推测。
* `product_name` 为临时描述, 一律带「待确认」标记。
* `confidence` 表示商品分组与类别识别的可信程度 (0-1)。
* `review_status`: `auto_recognized` / `needs_manual_review` / `human_confirmed`。

## 人工审核

打开 `catalog/review/index.html` (双击即可, 无需服务器)。页面支持按类别筛选、搜索商品编号、
放大查看原图、逐图标记「可用 / 不可用」、修改类别与审核状态, 并通过右上角按钮**导出
JSON / CSV**——审核结果不会被只保存在浏览器内存中。

## 识别方法说明（可追溯）

| 环节 | 实际做法 |
| --- | --- |
| 图片重复 | SHA256 全文比对（完全相同）+ 本地 DCT 感知哈希 pHash/dHash/aHash（不同压缩/尺寸的同一张图） |
| 商品分组 | 客户已按“每件一个文件夹”整理（40件 + 36件 = 76 件）→ 以文件夹为候选分组，再逐件做视觉复核确认；跨图库相似候选只标记不合并 |
| 商品类别 | 逐商品联络表视觉复核，逐件判定（针织服饰 / 其他服装 / 衬衫 / 围巾 / 其他配饰 / 待确认） |
| 图片角色 | 690 张图片逐张标注（正面 / 背面 / 细节 / 面料特写 / 平铺 / 说明 / 其他），标注结果写入 `catalog/review/authored_overrides.json` |
| 视觉特征 | 本地 CPU 特征：主体包围盒、构图居中度、清晰度(拉普拉斯方差)、边缘密度、曝光(仅统计商品像素)、背景洁净度、主色提取 |
| OCR | **未启用**：当前环境无可安装的 tesseract（无 root 权限），且逐件视觉复核确认图库中不存在商品编号/尺码文字（衣架上仅有品牌标识）。因此未做任何基于文字的编号推断 |
| AI 零样本分类 | 本地 CLIP 权重下载受网络限制未完成；即便可用也仅作本地 CPU 推理，**客户图片全程未上传任何第三方服务** |

## 复现方式

```bash
bash tools/run_pipeline.sh
```

全部步骤支持断点续跑, 中间结果缓存在 `catalog/.cache/`, 重复执行不会产生重复文件,
也不会重复写入已生成的副本。

## 体积

* 原始图库: {human(src_bytes)} ({len(inv)} 张, 只读未改动)
* catalog/ 派生资产: {human(out_bytes)}
"""
        (C.CATALOG_DIR / "README.md").write_text(md, "utf-8")
        stage.log(f"wrote {C.CATALOG_DIR / 'README.md'}")

        # processing log digest
        logs = []
        for lg in sorted((C.REPORTS_DIR / "logs").glob("*.log")):
            lines = lg.read_text("utf-8").splitlines()
            logs.append(f"### {lg.stem}\n\n```\n" + "\n".join(lines[-14:]) + "\n```\n")
        (C.REPORTS_DIR / "processing_log.md").write_text(
            "# 处理日志（可复现性记录）\n\n生成时间: "
            + C.time.strftime("%Y-%m-%d %H:%M:%S")
            + "\n\n"
            + "\n".join(logs),
            "utf-8",
        )
        stage.log("wrote processing_log.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
