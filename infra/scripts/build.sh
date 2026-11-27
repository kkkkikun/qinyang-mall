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

# 集成测试同样进流水线。
# 此前只跑单元测试，于是「路由覆盖守卫」「报价生命周期」这类只有集成层能发现的缺陷
# （例如控制器写了却没注册进模块，接口线上永远 404）根本不会在流水线里报警。
# 测试使用独立测试库 qinyang_mall_test（见 apps/api/test/setup-env.ts），
# 与开发库 qinyang_mall 完全隔离，流水线不会污染开发数据。
log "集成测试"
"${RUN_BUILD[@]}" pnpm --filter @qinyang/api test:integration

log "构建 API"
"${RUN_BUILD[@]}" pnpm --filter @qinyang/api build

log "构建管理后台"
"${RUN_BUILD[@]}" pnpm --filter @qinyang/admin-web build

# ── 真实环境页面级执行验证 ────────────────────────────────────────
#
# 教训（小程序侧先踩过）：「接口 200 + 类型全绿 + 验收全绿」并不能证明页面可用。
# 小程序 17 个页面、后台 9 个页面此前都只被静态检查过，从未在运行时执行过，
# 于是「顾客打开分类页是空列表」「模板字段取不到」这类缺陷一路活到验收之后。
#
# 这里用**本次构建产物**起一个独立 API 进程（不打扰已在运行的容器栈，
# 预览用的 18110/18111 不受影响），再让四套页面级执行桩打这个真实实例：
#   - 小程序写路径（顾客提交量体申请的真实链路）
#   - 小程序页面级（17 个页面逐一执行）
#   - 后台读路径（9 个视图 + 框架布局）
#   - 后台写路径（审核 → 报价 → 建单 → 推进 → 发货）
LIVE_PORT="${LIVE_PORT:-18112}"
LIVE_API="http://127.0.0.1:${LIVE_PORT}/api/v1"

log "启动本次构建的 API（独立进程，端口 ${LIVE_PORT}）"
mkdir -p infra/logs
if [ -f infra/docker/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . infra/docker/.env
  set +a
fi
export DB_HOST=127.0.0.1
export DB_PORT="${DB_PORT:-13316}"
export PORT="$LIVE_PORT"
export STORAGE_LOCAL_ROOT="${STORAGE_LOCAL_ROOT:-$ROOT/storage}"
export STORAGE_MEDIA_ROOT="${STORAGE_MEDIA_ROOT:-$ROOT/media}"
export STORAGE_PUBLIC_BASE_URL="http://127.0.0.1:${LIVE_PORT}/static"
export NODE_ENV="${NODE_ENV:-development}"

# 独立 API 进程同样受 CPU 上限约束（与构建同一批核）
"${RUN_BUILD[@]}" node apps/api/dist/main.js >>infra/logs/api-verify.log 2>&1 &
LIVE_PID=$!
cleanup_live() {
  kill "$LIVE_PID" 2>/dev/null || true
  wait "$LIVE_PID" 2>/dev/null || true
}
trap cleanup_live EXIT

live_ready=0
for _ in $(seq 1 60); do
  if node -e "fetch('http://127.0.0.1:${LIVE_PORT}/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    live_ready=1
    break
  fi
  sleep 1
done
if [ "$live_ready" != "1" ]; then
  echo "!! 本次构建的 API 未能就绪（见 infra/logs/api-verify.log），页面级执行验证无法进行" >&2
  tail -30 infra/logs/api-verify.log >&2 || true
  exit 1
fi
echo "[live] API 就绪：$LIVE_API"

log "页面级执行验证：小程序写路径"
"${RUN_BUILD[@]}" node tools/verify_miniprogram_flow.mjs "$LIVE_API"

log "页面级执行验证：小程序 17 个页面"
"${RUN_BUILD[@]}" node tools/verify_miniprogram_pages.mjs "$LIVE_API"

log "页面级执行验证：后台读路径（9 个视图 + 布局）"
"${RUN_BUILD[@]}" node tools/verify_admin_pages.mjs "$LIVE_API"

log "页面级执行验证：后台写路径（审核 → 报价 → 建单 → 发货）"
"${RUN_BUILD[@]}" node tools/verify_admin_write.mjs "$LIVE_API"

log "完成"
df -h . | tail -1
