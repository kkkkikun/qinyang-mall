import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { entities } from './entities';
import { migrations } from './migrations';

loadEnv();

/**
 * TypeORM 数据源（迁移与种子脚本使用）。
 *
 * 红线：**正式配置禁止 `synchronize`**，schema 只能由 migration 演进。
 * 这里显式写死 `synchronize: false`，即使环境变量误配也不会自动改表。
 *
 * 注意：本文件**只导出一个 DataSource 实例**（default），
 * 否则 TypeORM CLI 会报 "must contain only one export of DataSource instance"。
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number.parseInt(process.env.DB_PORT ?? '3306', 10),
  username: process.env.DB_USERNAME ?? 'qinyang',
  password: process.env.DB_PASSWORD ?? 'qinyang',
  database: process.env.DB_DATABASE ?? 'qinyang_mall',
  charset: 'utf8mb4',
  timezone: process.env.DB_TIMEZONE ?? '+08:00',
  entities,
  migrations,
  synchronize: false,
  migrationsRun: false,
  logging: process.env.DB_LOGGING === 'true' ? ['error', 'warn'] : ['error'],
  extra: {
    connectionLimit: Number.parseInt(process.env.DB_POOL_SIZE ?? '10', 10),
  },
};

export default new DataSource(dataSourceOptions);
