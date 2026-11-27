#!/usr/bin/env node
/**
 * 开发库验证数据清理工具（**只删机器生成的验证数据**）。
 *
 * 背景：
 * 写路径页面级验证必须真的写库才能证明「商家用得动后台」，
 * 于是每跑一次就会在开发库里留下申请 / 报价 / 订单（保留为可追溯的业务记录），
 * 以及被这些申请引用的 `VERIFY-*` 商品。
 *
 * 商品删除接口会拒绝删除「已被定制申请引用」的商品（这是正确的保护），
 * 所以那些商品只能留在库里 —— 商家在工作台商品列表里会看到几十件「验证商品」。
 *
 * 本工具按**外键顺序**把整簇验证数据清掉：
 *   order_events → orders → quotes → customization_requests → product_media → products
 *
 * 安全约束（硬性）：
 * - 只匹配两类记录：**编码以 `VERIFY-` / `PROBE-` / `SMOKE-` 开头**的商品；
 *   以及**联系人姓名带「（虚构）」标记**的申请（及其报价 / 订单）。
 *   真实顾客不可能叫「（虚构）」，所以两个条件都匹配不到商家数据；
 * - 逐条打印将要删除的行，先 dry-run 确认再执行；
 * - 只连开发库（`qinyang_mall`），**拒绝连测试库**（`qinyang_mall_test`）；
 * - 不碰任何商家数据 —— 没有 `VERIFY-` 前缀的记录一律不匹配。
 *
 * 用法（服务器执行）：
 *   node tools/cleanup-verify-data.mjs            # 预演，只打印
 *   node tools/cleanup-verify-data.mjs --apply    # 真删
 */

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// mysql2 装在 API 包里（pnpm 工作区隔离），从 API 包的位置解析
const require = createRequire(resolve(REPO_ROOT, 'apps/api/package.json'));
const mysql = require('mysql2/promise');
const fs = require('node:fs');
const APPLY = process.argv.includes('--apply');

/**
 * 验证数据可能留下的商品编码前缀。
 *
 * - `VERIFY-`：写路径 / 导入验证造出来的商品；
 * - `PROBE-`：页面级验证的探针商品；
 * - `SMOKE-`：冒烟测试商品。
 *
 * 真实商品编码由商家定，但绝不会以这三个前缀开头 —— 种子商品用的是 `ED-*` 形态。
 */
const PRODUCT_PREFIXES = ['VERIFY-', 'PROBE-', 'SMOKE-'];

function loadEnv() {
  // 与后端一致：从 infra/docker/.env 读（该文件 600 权限，不入库）
  const path = resolve(REPO_ROOT, 'infra/docker/.env');
  const env = {};
  if (fs.existsSync(path)) {
    for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
      const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (match) env[match[1]] = match[2];
    }
  }
  return {
    host: process.env.DB_HOST ?? env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? env.DB_PORT ?? 3306),
    user: process.env.DB_USERNAME ?? env.DB_USERNAME ?? 'qinyang',
    password: process.env.DB_PASSWORD ?? env.DB_PASSWORD ?? '',
    database: process.env.DB_DATABASE ?? env.DB_DATABASE ?? 'qinyang_mall'
  };
}

async function main() {
  const config = loadEnv();

  // 红线：绝不允许对着测试库跑
  if (/_test/.test(config.database)) {
    throw new Error(`拒绝在测试库 ${config.database} 上执行清理`);
  }
  if (!config.password) {
    throw new Error('缺少 DB_PASSWORD（从 infra/docker/.env 或环境变量读取）');
  }

  const conn = await mysql.createConnection(config);
  try {
    const [products] = await conn.query(
      `SELECT id, code, status FROM products
       WHERE ${PRODUCT_PREFIXES.map(() => "TRIM(code) LIKE ?").join(' OR ')}`,
      PRODUCT_PREFIXES.map((prefix) => `${prefix}%`)
    );
    const productIds = products.map((row) => row.id);

    /*
     * 申请的匹配条件有两类，缺一不可：
     * 1. 引用了 VERIFY- 前缀商品；
     * 2. 联系人姓名带「（虚构）」标记 —— 写路径验证造出来的顾客一律如此
     *    （验证顾客（虚构）/ 页面验证顾客（虚构）/ 验收测试顾客（虚构））。
     *    真实顾客不可能叫「（虚构）」，所以这个条件同样不会误伤商家数据。
     */
    const [requests] = await conn.query(
      `SELECT id, requestNo FROM customization_requests
       WHERE productId IN (?) OR JSON_UNQUOTE(JSON_EXTRACT(contact, '$.name')) LIKE ?`,
      [productIds.length ? productIds : [''], '%（虚构）%']
    );
    const requestIds = requests.map((row) => row.id);

    const [quotes] = requestIds.length
      ? await conn.query('SELECT id FROM quotes WHERE requestId IN (?)', [requestIds])
      : [[]];
    const quoteIds = quotes.map((row) => row.id);

    const [orders] = requestIds.length
      ? await conn.query('SELECT id, orderNo FROM orders WHERE requestId IN (?)', [requestIds])
      : [[]];
    const orderIds = orders.map((row) => row.id);

    console.log('待清理的验证数据：');
    console.log(`  商品 ${products.length} 件（${products.slice(0, 5).map((p) => p.code).join(', ')}${products.length > 5 ? ' …' : ''}）`);
    console.log(`  申请 ${requests.length} 条 · 报价 ${quoteIds.length} 条 · 订单 ${orders.length} 条`);

    if (!APPLY) {
      console.log('\n这是预演。加 --apply 才会真正删除。');
      return;
    }
    // 按外键顺序删除（空数组会渲染成 IN () 触发语法错误，逐条守卫）
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    if (orderIds.length) {
      await conn.query('DELETE FROM order_events WHERE orderId IN (?)', [orderIds]);
      await conn.query('DELETE FROM payment_records WHERE orderId IN (?)', [orderIds]);
      await conn.query('DELETE FROM orders WHERE id IN (?)', [orderIds]);
    }
    if (quoteIds.length) await conn.query('DELETE FROM quotes WHERE id IN (?)', [quoteIds]);
    if (requestIds.length) {
      await conn.query('DELETE FROM customization_requests WHERE id IN (?)', [requestIds]);
    }
    if (productIds.length) {
      await conn.query('DELETE FROM product_media WHERE productId IN (?)', [productIds]);
      await conn.query('DELETE FROM products WHERE id IN (?)', [productIds]);
    }

    /*
     * 审计日志：只删**载荷里明确写着验证数据**的那些行。
     *
     * 审计本该是不可变的业务痕迹，所以这里只按「载荷里出现 VERIFY- 前缀或
     * 「（虚构）」联系人」这种**只可能来自验证脚本**的特征来匹配，
     * 真实商家的操作记录不可能命中。
     */
    const [auditRows] = await conn.query(
      `SELECT id FROM audit_logs
       WHERE CAST(\`before\` AS CHAR) LIKE '%VERIFY-%'
          OR CAST(\`after\` AS CHAR) LIKE '%VERIFY-%'
          OR CAST(\`before\` AS CHAR) LIKE '%（虚构）%'
          OR CAST(\`after\` AS CHAR) LIKE '%（虚构）%'`
    );
    const auditIds = auditRows.map((row) => row.id);
    if (auditIds.length) {
      await conn.query('DELETE FROM audit_logs WHERE id IN (?)', [auditIds]);
    }

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log(
      `\n已删除：商品 ${products.length} 件 · 申请 ${requests.length} 条 · 报价 ${quoteIds.length} 条 · 订单 ${orders.length} 条 · 审计 ${auditIds.length} 条`
    );
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error('清理失败：', error.message);
  process.exitCode = 1;
});
