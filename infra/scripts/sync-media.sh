#!/usr/bin/env bash
# 把首批代表性商品的已处理图片同步到服务器（供服务器端图片流水线使用）
#
# 只同步白名单商品的 processed/ 与 thumbnails/，不同步 690 张原始素材，
# 也不重复同步其余 63 件商品的衍生图，控制传输量与磁盘占用。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOST="${QINYANG_SSH_HOST:-sqserver}"
REMOTE="${QINYANG_REMOTE_DIR:-/home/kikun/MyProject/clothing-mall-miniapp}"

# 首批 10-15 件代表性商品（覆盖针织/衬衫/裤装/裙装/卫衣/围巾）
PRODUCTS="${QINYANG_MEDIA_PRODUCTS:-ED-0001,ED-0003,ED-0006,ED-0007,ED-0008,ED-0009,ED-0018,ED-0021,ED-0024,ED-0032,ED-0043,ED-0060,ED-0062}"

IFS=',' read -ra LIST <<< "$PRODUCTS"
for pid in "${LIST[@]}"; do
  pid="$(echo "$pid" | tr -d '[:space:]')"
  [ -z "$pid" ] && continue
  src="$ROOT/catalog/products/$pid"
  if [ ! -d "$src/processed" ]; then
    echo "[media-sync] 跳过 $pid：本地缺少 processed/（catalog 未同步）" >&2
    continue
  fi
  echo "[media-sync] $pid → $HOST"
  ssh "$HOST" "mkdir -p '$REMOTE/catalog/products/$pid/processed' '$REMOTE/catalog/products/$pid/thumbnails'"
  rsync -az --delete \
    "$src/processed/" "$HOST:$REMOTE/catalog/products/$pid/processed/"
  rsync -az --delete \
    "$src/thumbnails/" "$HOST:$REMOTE/catalog/products/$pid/thumbnails/"
done

echo "[media-sync] 完成"
ssh "$HOST" "du -sh '$REMOTE/catalog/products' 2>/dev/null || true"
