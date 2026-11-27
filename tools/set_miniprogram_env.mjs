#!/usr/bin/env node
/**
 * 发布前注入小程序运行配置（构建期常量）。
 *
 * 用法：
 *   node tools/set_miniprogram_env.mjs https://api.qinyang.com/api/v1
 *
 * 为什么需要它（本轮审计 P0）：
 * 此前小程序基址默认回落到 `http://127.0.0.1:18110/api/v1`。
 * 真机上 127.0.0.1 指向**手机自己**，正式版小程序又拒收 http 域名 ——
 * 结果是「装到手机上就是废的」，而且界面只弹一句「网络连接失败」，
 * 顾客和客服都无从判断是网络问题还是服务地址没配。
 *
 * 现在基址来自 `apps/miniprogram/config/env.ts`，发布前由本脚本写入正式域名。
 * 脚本会校验：必须是 https（正式版小程序只允许 https 域名），
 * 且必须以 /api/v1 结尾（少一段会导致所有接口 404，而现象是「首页空」）。
 *
 * 不带参数运行 = 还原为占位值（开发态）。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(HERE, '..', 'apps', 'miniprogram', 'config', 'env.ts');

const PLACEHOLDER = '';

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

const raw = (process.argv[2] || '').trim();

if (!raw) {
  // 还原占位值
  const source = readFileSync(ENV_FILE, 'utf-8');
  const next = source.replace(/export const API_BASE_URL = '[^']*';/, `export const API_BASE_URL = '${PLACEHOLDER}';`);
  writeFileSync(ENV_FILE, next, 'utf-8');
  console.log('✅ 已把小程序基址还原为占位值（开发态使用 dev 兜底）');
  process.exit(0);
}

if (!/^https:\/\//i.test(raw)) {
  fail(`正式基址必须以 https:// 开头（正式版小程序只允许 https 域名）：${raw}`);
}
if (!/\/api\/v1\/?$/i.test(raw)) {
  fail(`基址必须以 /api/v1 结尾（少一段会导致所有接口 404）：${raw}`);
}
if (/\s/.test(raw)) {
  fail(`基址里不能有空格：${raw}`);
}

const source = readFileSync(ENV_FILE, 'utf-8');
if (!/export const API_BASE_URL = '[^']*';/.test(source)) {
  fail(`未在 ${ENV_FILE} 找到 API_BASE_URL 声明`);
}
const next = source.replace(/export const API_BASE_URL = '[^']*';/, `export const API_BASE_URL = '${raw}';`);
writeFileSync(ENV_FILE, next, 'utf-8');
console.log(`✅ 小程序基址已写入：${raw}`);
console.log('   记得同步到仓库并重新构建小程序。');
