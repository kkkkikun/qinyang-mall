#!/usr/bin/env bash
# 备份与恢复演练（P4 交付门槛）
#
# 流程：
# 1. 从运行中的 MySQL 容器导出全量 SQL（--single-transition 保证一致性）
# 2. 恢复到**独立**的演练库 qinyang_mall_restore
# 3. 比对源库与演练库的表数量与关键表行数
# 4. 清理演练库
#
# 演练库是临时的，演练结束即删除；源库只读，不受影响。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-infra/docker/.env}"
set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

MYSQL_CONTAINER="${MYSQL_CONTAINER:-qinyang-mysql}"
SOURCE_DB="${SOURCE_DB:-$DB_DATABASE}"
RESTORE_DB="${RESTORE_DB:-qinyang_mall_restore}"
BACKUP_DIR="${BACKUP_DIR:-infra/backups}"
ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-qinyang-root}"
APP_USER="${DB_USERNAME:-qinyang}"
APP_PASSWORD="${DB_PASSWORD:-qinyang}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/${SOURCE_DB}-${STAMP}.sql"

echo "[1/5] 导出 $SOURCE_DB → $BACKUP_FILE"
docker exec "$MYSQL_CONTAINER" mysqldump \
  -u"$APP_USER" -p"$APP_PASSWORD" \
  --single-transaction --routines --triggers --events \
  --set-gtid-purged=OFF --no-tablespaces \
  "$SOURCE_DB" >"$BACKUP_FILE"

SIZE=$(stat -c%s "$BACKUP_FILE")
echo "      备份大小: $((SIZE / 1024)) KB"
if [ "$SIZE" -lt 1024 ]; then
  echo "      ❌ 备份文件异常小，演练中止" >&2
  exit 1
fi

echo "[2/5] 恢复到演练库 $RESTORE_DB"
docker exec "$MYSQL_CONTAINER" mysql -uroot -p"$ROOT_PASSWORD" -e \
  "DROP DATABASE IF EXISTS \`${RESTORE_DB}\`; CREATE DATABASE \`${RESTORE_DB}\` DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>&1 \
  | grep -v "Using a password" || true
docker exec -i "$MYSQL_CONTAINER" mysql -uroot -p"$ROOT_PASSWORD" "$RESTORE_DB" <"$BACKUP_FILE" 2>&1 \
  | grep -v "Using a password" || true

echo "[3/5] 比对表结构"
SRC_TABLES=$(docker exec "$MYSQL_CONTAINER" mysql -uroot -p"$ROOT_PASSWORD" -N -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${SOURCE_DB}';" 2>/dev/null | tail -1)
DST_TABLES=$(docker exec "$MYSQL_CONTAINER" mysql -uroot -p"$ROOT_PASSWORD" -N -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${RESTORE_DB}';" 2>/dev/null | tail -1)
echo "      源库表数=$SRC_TABLES  演练库表数=$DST_TABLES"
[ "$SRC_TABLES" = "$DST_TABLES" ] || { echo "      ❌ 表数量不一致" >&2; exit 1; }

echo "[4/5] 比对关键表行数"
FAILED=0
for table in products product_media categories measurement_templates customization_requests quotes orders audit_logs admin_users; do
  SRC=$(docker exec "$MYSQL_CONTAINER" mysql -uroot -p"$ROOT_PASSWORD" -N -e \
    "SELECT COUNT(*) FROM \`${SOURCE_DB}\`.\`${table}\`;" 2>/dev/null | tail -1)
  DST=$(docker exec "$MYSQL_CONTAINER" mysql -uroot -p"$ROOT_PASSWORD" -N -e \
    "SELECT COUNT(*) FROM \`${RESTORE_DB}\`.\`${table}\`;" 2>/dev/null | tail -1)
  if [ "$SRC" = "$DST" ]; then
    printf '      ✅ %-24s %s 行\n' "$table" "$SRC"
  else
    printf '      ❌ %-24s 源=%s 演练=%s\n' "$table" "$SRC" "$DST"
    FAILED=1
  fi
done

echo "[5/5] 清理演练库"
docker exec "$MYSQL_CONTAINER" mysql -uroot -p"$ROOT_PASSWORD" -e \
  "DROP DATABASE IF EXISTS \`${RESTORE_DB}\`;" 2>&1 | grep -v "Using a password" || true

echo "      备份文件保留在：$BACKUP_FILE"

if [ "$FAILED" -ne 0 ]; then
  echo "❌ 备份恢复演练失败"
  exit 1
fi
echo "✅ 备份恢复演练通过：结构一致、关键表行数一致"
