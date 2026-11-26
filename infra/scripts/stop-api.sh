#!/usr/bin/env bash
# 停止以独立进程运行的 API（开发 / 联调环境）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PID_FILE="$ROOT/infra/logs/api.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "[api] 未找到 pid 文件，可能未以独立进程运行"
  exit 0
fi

PID="$(cat "$PID_FILE")"
if kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  for _ in $(seq 1 20); do
    kill -0 "$PID" 2>/dev/null || break
    sleep 0.5
  done
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" 2>/dev/null || true
  fi
  echo "[api] 已停止 pid=$PID"
else
  echo "[api] 进程 $PID 不存在"
fi
rm -f "$PID_FILE"
