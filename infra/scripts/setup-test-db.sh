#!/usr/bin/env bash
# 准备集成测试数据库（只影响 qinyang_mall_test，绝不触碰开发库）
#
# 用 root 连接创建测试库并把权限授予应用账号；
# 测试库与应用库物理隔离，测试产生的脏数据不会影响开发数据。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-infra/docker/.env}"
if [ ! -f "$ENV_FILE" ]; then
  echo "缺少 $ENV_FILE，无法确定数据库凭据" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

MYSQL_CONTAINER="${MYSQL_CONTAINER:-qinyang-mysql}"
TEST_DB="${TEST_DB:-qinyang_mall_test}"
APP_USER="${DB_USERNAME:-qinyang}"
APP_PASSWORD="${DB_PASSWORD:-qinyang}"
ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-qinyang-root}"

docker exec "$MYSQL_CONTAINER" mysql -uroot -p"$ROOT_PASSWORD" -e "
  CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  GRANT ALL PRIVILEGES ON \`${TEST_DB}\`.* TO '${APP_USER}'@'%';
  FLUSH PRIVILEGES;
" 2>&1 | grep -v "Using a password" || true

echo "[test-db] ${TEST_DB} 就绪，账号 ${APP_USER}"
