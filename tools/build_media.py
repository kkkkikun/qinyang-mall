#!/usr/bin/env python3
"""
服务器端商品图片处理流水线。

输入：catalog/products/<PID>/processed/*.jpg（原始分辨率衍生图，只读）
输出：media/products/<PID>/<IMGID>-{4x5,1x1,thumb}.jpg + media/manifest.json

约束：
- 只处理清单中显式列出的商品，不批量扫描全部 76 件。
- 不修改 catalog/ 下任何文件，不覆盖原始图片。
- 输出尺寸：小程序详情图长边 1200、列表缩略图长边 600，JPEG 质量 82/80。
- 幂等：重复执行覆盖同名输出，不产生重复文件。
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    print("需要 Pillow：python3 -m pip install pillow", file=sys.stderr)
    raise


@dataclass
class MediaEntry:
    product_code: str
    image_id: str
    source: str
    variants: dict[str, str] = field(default_factory=dict)
    width: int = 0
    height: int = 0

    def to_dict(self) -> dict:
        return {
            "productCode": self.product_code,
            "imageId": self.image_id,
            "source": self.source,
            "width": self.width,
            "height": self.height,
            "variants": self.variants,
        }


VARIANTS = {
    # 名称: (最长边, 目标画布宽, 目标画布高, 质量)
    "4x5": (1200, 900, 1125, 82),
    "1x1": (1200, 1000, 1000, 82),
    "thumb": (600, 600, 600, 80),
}


def fit_and_cover(img: Image.Image, width: int, height: int) -> Image.Image:
    """等比缩放后居中裁切到目标画布，保持比例不变形、不拉伸。"""
    img = img.convert("RGB")
    target_ratio = width / height
    src_ratio = img.width / img.height
    if src_ratio > target_ratio:
        new_h = height
        new_w = max(width, int(round(height * src_ratio)))
    else:
        new_w = width
        new_h = max(height, int(round(width / src_ratio)))
    img = img.resize((new_w, new_h), Image.LANCZOS)
    left = (new_w - width) // 2
    top = (new_h - height) // 2
    return img.crop((left, top, left + width, top + height))


def fit_within(img: Image.Image, max_edge: int) -> Image.Image:
    """等比缩放到最长边不超过 max_edge，不放大原图。"""
    img = img.convert("RGB")
    w, h = img.size
    longest = max(w, h)
    if longest <= max_edge:
        return img
    ratio = max_edge / longest
    return img.resize((max(1, int(round(w * ratio))), max(1, int(round(h * ratio)))), Image.LANCZOS)


def build_role_map(manifest: dict) -> dict[str, dict[str, str]]:
    """从 image_manifest.json 推导每张图的用途：cover/front/back/detail/fabric。"""
    roles: dict[str, dict[str, str]] = {}
    for product in manifest.get("products", []):
        code = product["productId"]
        mapping: dict[str, str] = {}
        cover_source = product.get("coverSource")
        image_ids = product.get("imageIds", [])
        gallery = product.get("galleryImages", [])
        detail = product.get("detailImages", [])

        def index_of(path: str | None) -> int | None:
            if not path:
                return None
            try:
                return gallery.index(path) if path in gallery else detail.index(path)
            except ValueError:
                return None

        cover_idx = index_of(cover_source)
        for idx, image_id in enumerate(image_ids):
            role = "DETAIL"
            if cover_idx is not None and idx == cover_idx:
                role = "COVER"
            elif idx < len(gallery):
                role = "FRONT"
            mapping[image_id] = role
        roles[code] = mapping
    return roles


def main() -> int:
    parser = argparse.ArgumentParser(description="琴扬商城商品图片处理流水线")
    parser.add_argument("--catalog-root", default="catalog")
    parser.add_argument("--output-root", default="media")
    parser.add_argument("--manifest", default="catalog/reports/image_manifest.json")
    parser.add_argument(
        "--products",
        required=True,
        help="逗号分隔的商品编号白名单，例如 ED-0006,ED-0032",
    )
    args = parser.parse_args()

    catalog_root = Path(args.catalog_root)
    output_root = Path(args.output_root)
    codes = [code.strip() for code in args.products.split(",") if code.strip()]

    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        print(f"缺少清单文件：{manifest_path}", file=sys.stderr)
        return 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    role_map = build_role_map(manifest)

    entries: list[MediaEntry] = []
    skipped: list[str] = []

    for code in codes:
        source_dir = catalog_root / "products" / code / "processed"
        if not source_dir.exists():
            skipped.append(f"{code}: 缺少 {source_dir}")
            continue
        target_dir = output_root / "products" / code
        target_dir.mkdir(parents=True, exist_ok=True)
        roles = role_map.get(code, {})

        for source_path in sorted(source_dir.glob("*.jpg")):
            image_id = source_path.stem
            entry = MediaEntry(
                product_code=code,
                image_id=image_id,
                source=str(source_path),
            )
            with Image.open(source_path) as img:
                entry.width, entry.height = img.size
                for variant, (max_edge, cw, ch, quality) in VARIANTS.items():
                    scaled = fit_within(img, max_edge)
                    canvas = fit_and_cover(scaled, cw, ch)
                    out_path = target_dir / f"{image_id}-{variant}.jpg"
                    canvas.save(out_path, "JPEG", quality=quality, optimize=True, progressive=True)
                    entry.variants[variant] = str(out_path)
            entries.append(entry)
        print(f"[media] {code}: {len(list(target_dir.glob('*.jpg')))} 个输出文件", flush=True)

    output_root.mkdir(parents=True, exist_ok=True)
    manifest_out = {
        "schemaVersion": "1.0",
        "variants": {
            name: {"maxEdge": cfg[0], "canvas": [cfg[1], cfg[2]], "quality": cfg[3]}
            for name, cfg in VARIANTS.items()
        },
        "roles": role_map,
        "products": codes,
        "entries": [entry.to_dict() for entry in entries],
    }
    (output_root / "manifest.json").write_text(
        json.dumps(manifest_out, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    if skipped:
        print("[media] 跳过：", file=sys.stderr)
        for item in skipped:
            print(f"  - {item}", file=sys.stderr)
    print(f"[media] 完成，共处理 {len(entries)} 张源图")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
