#!/usr/bin/env bash
# 鄂多蘭 商品数字资产库 — 全流程可复现执行脚本
#
#   bash tools/run_pipeline.sh
#
# 所有步骤都支持断点续跑：中间结果缓存在 catalog/.cache/，
# 已完成的文件不会重复处理，重复执行不会产生重复文件。
#
# 可选：CLIP 零样本分类。若 .cache/clip-vit-base-patch32/ 下存在完整模型，
# tools/assign_labels.py 会自动用 CLIP 标注，否则回退到 CV 启发式 +
# catalog/review/authored_overrides.json 中的视觉复核结果。
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== 鄂多蘭 catalog pipeline ==="
python3 tools/scan_inventory.py          # 阶段1 全量盘点（尺寸/格式/体积/SHA256/pHash）
python3 tools/extract_features.py        # 阶段1 CV 质量与构图特征
python3 tools/find_duplicates.py         # 阶段2 完全重复 / 疑似重复
python3 tools/cross_library_check.py     # 阶段2 跨图库相似候选
python3 tools/extract_embeddings.py      # 阶段2 CLIP 向量（可选，模型缺失时跳过）
python3 tools/cluster_products.py        # 阶段2 商品候选分组
python3 tools/assign_labels.py           # 阶段3 类别 / 角色标注
python3 tools/process_images.py          # 阶段4 质量检测 + 图片副本
python3 tools/rename_derivatives.py      # 阶段4 副本文件对齐到 IMG-xxxx 编号
python3 tools/build_catalog.py           # 阶段5-6 目录 / CSV / JSON 清单
python3 tools/build_review.py            # 阶段7 人工审核页面
python3 tools/make_review_sheets.py      # 阶段7 逐商品联络表（人工复核用）
python3 tools/ai_readiness.py            # 阶段8 AI 模特素材准备度
python3 tools/build_readme.py            # 目录说明与处理日志
python3 tools/audit_acceptance.py        # 验收自检（对照 docs/p1.md §12）
echo "=== done ==="
