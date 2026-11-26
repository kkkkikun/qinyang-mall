#!/usr/bin/env bash
# 在学校服务器上以独立进程运行 API（开发 / 联调环境）
#
# 约束：
# - 只监听 127.0.0.1，管理后台与 API 通过 SSH 隧道访问，不暴露校园网
# - 日志写入 infra/logs/api.log，文件大小受限，避免无限增长
# - 复用隔离的 MySQL 容器 qinyang-mysql
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export NODE_HOME="${NODE_HOME:-$HOME/tools/node-v24.22.3}"
export PATH="$NODE_HOME/bin:$PATH"

ENV_FILE="${ENV_FILE:-infra/docker/.env}"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

export DB_HOST=127.0.0.1
export DB_PORT="${DB_PORT:-13316}"
export PORT="${PORT:-18110}"
export STORAGE_LOCAL_ROOT="${STORAGE_LOCAL_ROOT:-$ROOT/media}"
export STORAGE_PUBLIC_BASE_URL="${STORAGE_PUBLIC_BASE_URL:-http://127.0.0.1:$PORT/static}"
export NODE_ENV="${NODE_ENV:-development}"

LOG_DIR="$ROOT/infra/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/api.log"

# 轮转：超过 20MB 时归档，保留 5 份
if [ -f "$LOG_FILE" ] && [ "$(stat -c%s "$LOG_FILE")" -gt $((20 * 1024 * 1024)) ]; then
  mv "$LOG_FILE" "$LOG_FILE.1"
fi

PID_FILE="$LOG_DIR/api.pid"
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "[api] 已在运行，pid=$(cat "$PID_FILE")"
  exit 0
fi

nohup node apps/api/dist/main.js >>"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"
sleep 4

if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "[api] 已启动 pid=$(cat "$PID_FILE")  http://127.0.0.1:$PORT/api/v1"
else
  echo "[api] 启动失败，日志尾部：" >&2
  tail -30 "$LOG_FILE" >&2
  exit 1
fi
