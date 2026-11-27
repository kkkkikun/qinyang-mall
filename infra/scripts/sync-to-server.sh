#!/usr/bin/env bash
# 本地 → 学校服务器源码同步（唯一允许的同步入口）
#
# 原则：
# 1. 同步的是**本地已提交的固定状态**；同步后服务器以 git commit 为准构建。
# 2. 不同步 images/（11GB 原始素材）与 catalog/products/（8.3GB 衍生副本），
#    这两者在服务器上按需单独处理，避免无谓的磁盘与带宽消耗。
# 3. 不同步 node_modules / dist 等构建产物。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOST="${QINYANG_SSH_HOST:-sqserver}"
REMOTE="${QINYANG_REMOTE_DIR:-/home/kikun/MyProject/clothing-mall-miniapp}"
MODE="${1:-sync}"

RSYNC_EXCLUDES=(
  --exclude='node_modules/'
  --exclude='dist/'
  --exclude='build/'
  --exclude='.pnpm-store/'
  --exclude='images/'
  --exclude='catalog/products/'
  --exclude='catalog/.cache/'
  --exclude='media/'
  # 顺序重要：先 include 模板（无密钥，需正常同步），
  # 再排除真实密钥文件；rsync 的 --delete 不会删除被排除的文件。
  --include='.env.example'
  --exclude='.env'
  --exclude='.env.*'
  --exclude='infra/logs/'
  --exclude='infra/backups/'
  --exclude='coverage/'
  --exclude='*.log'
  --exclude='.DS_Store'
  --exclude='apps/admin-web/.harness-tmp/'
)

case "$MODE" in
  sync)
    echo "[sync] $ROOT -> $HOST:$REMOTE"
    rsync -az --delete \
      --exclude='.git/' \
      "${RSYNC_EXCLUDES[@]}" \
      "$ROOT/" "$HOST:$REMOTE/"
    ;;
  git)
    # 同步包含 .git，使服务器持有完整提交历史，可按 commit 构建
    echo "[git] $ROOT -> $HOST:$REMOTE (含 .git)"
    rsync -az --delete \
      "${RSYNC_EXCLUDES[@]}" \
      "$ROOT/" "$HOST:$REMOTE/"
    ;;
  *)
    echo "用法: $0 [sync|git]" >&2
    exit 2
    ;;
esac

echo "[sync] 完成"
ssh "$HOST" "cd '$REMOTE' && git status --short | head -20; git log --oneline -1 2>/dev/null || true"
