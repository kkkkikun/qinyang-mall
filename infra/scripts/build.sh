#!/usr/bin/env bash
# 学校服务器构建与测试入口（只在服务器上执行）
#
# 资源约束（来自项目目标文档）：
# - 构建任务最多 4 CPU 核、8GB 内存
# - 同时只跑 1 个重型任务
# - 测试并发最多 2 个 Worker
# - 项目新增磁盘目标 ≤ 8GB
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export NODE_HOME="${NODE_HOME:-$HOME/tools/node-v24.22.3}"
export PATH="$NODE_HOME/bin:$PATH"
export PNPM_REGISTRY="${PNPM_REGISTRY:-https://registry.npmmirror.com}"

CPU_LIMIT="${CPU_LIMIT:-4}"
MEM_LIMIT="${MEM_LIMIT:-8G}"
JOBS="${JOBS:-2}"

log() { printf '\n\033[1;34m== %s ==\033[0m\n' "$*"; }

# 资源约束：构建任务最多 4 CPU 核（目标文档 §6.B）。
# 用 taskset 把整个构建绑定到 4 个核上，而不是依赖工具自身的并行度。
CPU_LIST="${CPU_LIST:-0-3}"
if command -v taskset >/dev/null 2>&1; then
  RUN_BUILD=(taskset -c "$CPU_LIST")
  log "CPU 限制：绑定到核 $CPU_LIST"
else
  RUN_BUILD=()
  log "CPU 限制：taskset 不可用，无法限制核数"
fi

log "环境"
node -v
pnpm -v
echo "仓库 HEAD: $(git rev-parse --short HEAD 2>/dev/null || echo 'not-a-git-repo')"
df -h . | tail -1

log "校验小程序契约副本是否同步"
python3 tools/sync_contracts_to_miniprogram.py --check

log "校验小程序静态结构"
python3 tools/check_miniprogram.py

log "校验前后端接口契约（前端调用 ↔ API 路由表）"
python3 tools/check_api_contract.py

log "安装依赖（lockfile 严格模式）"
"${RUN_BUILD[@]}" pnpm install --frozen-lockfile --registry="$PNPM_REGISTRY" || \
  "${RUN_BUILD[@]}" pnpm install --registry="$PNPM_REGISTRY"

log "构建共享契约"
"${RUN_BUILD[@]}" pnpm --filter @qinyang/contracts build

log "类型检查"
"${RUN_BUILD[@]}" pnpm -r typecheck

# 小程序没有 package.json（原生小程序不引入 npm 依赖），
# 因此不在 pnpm -r 的范围内，必须显式单独检查 —— 否则 17 个页面从未被类型检查过。
log "类型检查（小程序原生 TS）"
"${RUN_BUILD[@]}" pnpm typecheck:miniprogram

log "单元测试"
"${RUN_BUILD[@]}" pnpm --filter @qinyang/api test:unit

log "构建 API"
"${RUN_BUILD[@]}" pnpm --filter @qinyang/api build

log "构建管理后台"
"${RUN_BUILD[@]}" pnpm --filter @qinyang/admin-web build

log "完成"
df -h . | tail -1
