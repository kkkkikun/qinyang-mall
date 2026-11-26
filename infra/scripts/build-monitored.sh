#!/usr/bin/env bash
# 带资源监控的构建：在服务器上执行构建并记录 CPU 峰值、内存峰值、磁盘增量与耗时。
#
# 用法：bash infra/scripts/build-monitored.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export NODE_HOME="${NODE_HOME:-$HOME/tools/node-v24.22.3}"
export PATH="$NODE_HOME/bin:$PATH"

LOG="$ROOT/infra/logs/build-monitored.log"
mkdir -p "$(dirname "$LOG")"

CPU_SAMPLE="$LOG.cpu"
MEM_SAMPLE="$LOG.mem"
: >"$CPU_SAMPLE"
: >"$MEM_SAMPLE"

sample() {
  local pid="$1"
  while kill -0 "$pid" 2>/dev/null; do
    # 采样本项目相关的**全部**进程（含孙子进程，如 vite build 的 esbuild 子进程）：
    # 以命令行中出现工作区路径为判据，避免只统计到直接子进程而低估峰值
    ps -eo %cpu=,rss=,args= 2>/dev/null \
      | grep -F "$ROOT" \
      | grep -vE 'grep|build-monitored' \
      | awk '{cpu+=$1; rss+=$2} END {if (cpu>0 || rss>0) print cpu, rss}' \
      >>"$CPU_SAMPLE" || true
    sleep 0.5
  done
}

before_disk=$(df -k . | tail -1 | awk '{print $3}')
start=$(date +%s)

bash infra/scripts/build.sh >"$LOG" 2>&1 &
build_pid=$!
sample "$build_pid"
wait "$build_pid"
status=$?

after_disk=$(df -k . | tail -1 | awk '{print $3}')
end=$(date +%s)

peak_cpu=$(awk '{if ($1+0 > m) m=$1+0} END {printf "%.1f", m+0}' "$CPU_SAMPLE")
peak_mem_kb=$(awk '{if ($2+0 > m) m=$2+0} END {printf "%.0f", m+0}' "$CPU_SAMPLE")
disk_delta_kb=$((after_disk - before_disk))

echo "构建退出码: $status"
echo "执行时间: $((end - start)) 秒"
echo "CPU 峰值: ${peak_cpu}%"
echo "内存峰值: $((peak_mem_kb / 1024)) MB"
echo "磁盘增量: $((disk_delta_kb / 1024)) MB"
echo "日志: $LOG"
exit "$status"
