#!/usr/bin/env node
/**
 * API 性能基线测量（真实环境）。
 *
 * 目的：让性能优化由**实测数据**驱动，而不是拍脑袋。
 * 每次测量输出：每个端点的 P50 / P95 / 最大耗时、响应体大小、HTTP 状态码。
 * 结果写入 JSON 基线文件，供优化前后对比。
 *
 * 说明：
 * - 只测**读路径**（前端真正会反复调用的接口）与健康检查；
 *   写路径会改动业务数据，不适合反复采样；
 * - 所有 ID 从实时接口取，不写死；
 * - 全部数据为虚构/种子数据，不使用真实顾客数据。
 *
 * 用法（服务器执行）：
 *   node tools/measure_api_perf.mjs [apiBaseUrl] [样本数]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { URL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.argv[2] ?? 'http://127.0.0.1:18110/api/v1').replace(/\/$/, '');
const SAMPLES = Number(process.argv[3] ?? 20);
const OUT_FILE = join(REPO, 'docs', 'agent', 'perf-baseline.json');
const ADMIN_USER = process.env.SEED_OWNER_USERNAME ?? 'owner';
const ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD ?? 'Qinyang@2026';

async function call(path, { method = 'GET', body, token, customerToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (customerToken) headers['x-customer-token'] = customerToken;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  // 响应体只能读一次：取文本后再解析 JSON
  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = null;
  }
  return { status: res.status, body: payload, text };
}

/**
 * 用原生 http 请求测**压缩后的实际传输体积**。
 *
 * fetch 会自动解压，量到的是解压后的 JSON 大小；
 * 但顾客端真正付出的流量是压缩后的字节数（小程序直连 API，不过 nginx）。
 */
function wireSize(path, options = {}) {
  return new Promise((resolve) => {
    const url = new URL(`${BASE}${path}`);
    const headers = { 'Accept-Encoding': 'gzip' };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.customerToken) headers['x-customer-token'] = options.customerToken;
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers,
      },
      (res) => {
        let bytes = 0;
        res.on('data', (chunk) => {
          bytes += chunk.length;
        });
        res.on('end', () => resolve({ bytes, encoding: res.headers['content-encoding'] ?? null }));
      }
    );
    req.on('error', () => resolve({ bytes: 0, encoding: null }));
    req.end();
  });
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function measure(name, path, options = {}) {
  const times = [];
  let bytes = 0;
  let status = 0;
  // 预热一次，避免把 JIT/连接建立算进来
  await call(path, options);
  for (let i = 0; i < SAMPLES; i += 1) {
    const started = process.hrtime.bigint();
    const res = await call(path, options);
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    times.push(elapsed);
    status = res.status;
    bytes = Buffer.byteLength(res.text, 'utf-8');
  }
  const sorted = [...times].sort((a, b) => a - b);
  const wire = await wireSize(path, options);
  const result = {
    name,
    path,
    status,
    bytes,
    wireBytes: wire.bytes,
    wireEncoding: wire.encoding,
    p50: Number(percentile(sorted, 50).toFixed(2)),
    p95: Number(percentile(sorted, 95).toFixed(2)),
    max: Number(Math.max(...times).toFixed(2))
  };
  return result;
}

async function main() {
  console.log(`=== API 性能基线测量 ===`);
  console.log(`目标：${BASE}，每端点采样 ${SAMPLES} 次\n`);

  // ── 取真实 ID ─────────────────────────────────────────────
  const adminLogin = await call('/admin/auth/login', {
    method: 'POST',
    body: { username: ADMIN_USER, password: ADMIN_PASS }
  });
  const adminToken = adminLogin.body?.data?.token;
  if (!adminToken) {
    throw new Error(`管理员登录失败：HTTP ${adminLogin.status}`);
  }
  const custLogin = await call('/auth/login', {
    method: 'POST',
    body: { code: `dev:perf-${Date.now()}` }
  });
  const customerToken = custLogin.body?.data?.token;

  const admin = { token: adminToken };
  const cust = { customerToken };

  const productsRes = await call('/products?pageSize=20', {});
  const product = productsRes.body?.data?.items?.[0];
  const categoriesRes = await call('/categories', {});
  const category = categoriesRes.body?.data?.[0];
  const templatesRes = await call('/admin/measurement-templates', admin);
  const template = templatesRes.body?.data?.[0];
  const adminProductsRes = await call('/admin/products?pageSize=20', admin);
  const adminProduct = adminProductsRes.body?.data?.items?.[0];
  const adminRequestsRes = await call('/admin/customization-requests?pageSize=20', admin);
  const adminRequest = adminRequestsRes.body?.data?.items?.[0];
  const adminOrdersRes = await call('/admin/orders?pageSize=20', admin);
  const adminOrder = adminOrdersRes.body?.data?.items?.[0];
  const bannersRes = await call('/admin/banners', admin);
  const banner = bannersRes.body?.data?.[0];

  if (!product || !category || !adminProduct) {
    throw new Error('基础数据缺失，无法测量（需要已发布商品与分类）');
  }

  const specs = [
    ['健康检查', '/health', {}],
    ['公开·轮播', '/banners', {}],
    ['公开·分类树', '/categories', {}],
    ['公开·商品列表', '/products?pageSize=20', {}],
    ['公开·商品详情', `/products/${product.id}`, {}],
    ['公开·图文页', '/guides/measure-top', {}],
    ['公开·模板解析', `/measurement-templates/resolve?productId=${product.id}`, {}],
    ['顾客·我的资料', '/auth/me', cust],
    ['顾客·我的申请', '/customization-requests', cust],
    ['顾客·我的订单', '/orders', cust],
    ['后台·我的资料', '/admin/auth/me', admin],
    ['后台·商品列表', '/admin/products?pageSize=20', admin],
    ['后台·商品详情', `/admin/products/${adminProduct.id}`, admin],
    ['后台·分类树', '/admin/categories', admin],
    ['后台·轮播列表', '/admin/banners', admin],
    ['后台·模板列表', '/admin/measurement-templates', admin],
    ['后台·模板详情', `/admin/measurement-templates/${template?.id ?? ''}`, admin],
    ['后台·申请列表', '/admin/customization-requests?pageSize=20', admin],
    ['后台·订单列表', '/admin/orders?pageSize=20', admin],
    ['后台·审计日志', '/admin/audit-logs?pageSize=20', admin]
  ];
  if (adminRequest) {
    specs.push(['后台·申请详情', `/admin/customization-requests/${adminRequest.id}`, admin]);
    specs.push(['后台·申请报价历史', `/admin/customization-requests/${adminRequest.id}/quotes`, admin]);
  }
  if (adminOrder) {
    specs.push(['后台·订单详情', `/admin/orders/${adminOrder.id}`, admin]);
  }

  const results = [];
  for (const [name, path, options] of specs) {
    try {
      const r = await measure(name, path, options);
      results.push(r);
      const flag = r.status !== 200 ? ' ⚠️' : '';
      console.log(
        `${r.p50.toFixed(1).padStart(7)} ms  p95 ${String(r.p95).padStart(7)} ms  ` +
          `${String(r.bytes).padStart(7)} B  传输 ${String(r.wireBytes).padStart(7)} B` +
          `${r.wireEncoding ? '(' + r.wireEncoding + ')' : '        '}  HTTP ${r.status}${flag}  ${name}`
      );
    } catch (error) {
      console.log(`     —— 测量失败：${name} (${error.message})`);
    }
  }

  const sorted = [...results].sort((a, b) => b.p95 - a.p95);
  console.log('\n--- 按 P95 倒序（最该优化的前 8 个）---');
  sorted.slice(0, 8).forEach((r, i) => {
    console.log(`${i + 1}. ${r.name}  p95 ${r.p95} ms  ${r.bytes} B  ${r.path}`);
  });
  const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
  const totalWire = results.reduce((sum, r) => sum + (r.wireBytes || 0), 0);
  const worstP95 = results.length ? Math.max(...results.map((r) => r.p95)) : 0;
  console.log(
    `\n合计响应体 ${(totalBytes / 1024).toFixed(1)} KB，线上传输 ${(totalWire / 1024).toFixed(1)} KB` +
      `（${results.length} 个端点），最差 P95 ${worstP95} ms`
  );

  const payload = {
    measuredAt: new Date().toISOString(),
    base: BASE,
    samples: SAMPLES,
    results
  };
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  console.log(`基线已写入：${OUT_FILE}`);
}

main().catch((error) => {
  console.error(`\n❌ 测量失败：${error.stack ?? error}`);
  process.exitCode = 1;
});
