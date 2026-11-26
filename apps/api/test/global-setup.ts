import { execSync } from 'node:child_process';

/**
 * 集成测试前置：在独立测试库 `qinyang_mall_test` 上执行迁移。
 *
 * 测试库的创建与授权由 `infra/scripts/setup-test-db.sh` 完成（需要 root 权限），
 * 本文件只负责保证 schema 是最新的 —— 绝不触碰开发库 `qinyang_mall`。
 */
export default async function globalSetup(): Promise<void> {
  const testDb = process.env.TEST_DB_DATABASE ?? 'qinyang_mall_test';
  if (testDb === 'qinyang_mall') {
    throw new Error(
      '集成测试禁止在开发库上运行：TEST_DB_DATABASE 必须为独立测试库',
    );
  }
  process.env.DB_DATABASE = testDb;

  execSync(
    'node -r ts-node/register/transpile-only -r tsconfig-paths/register ./node_modules/typeorm/cli.js -d src/database/data-source.ts migration:run',
    { stdio: 'inherit', env: process.env },
  );
}
