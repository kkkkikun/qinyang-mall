#!/usr/bin/env node
/**
 * P1–P3 垂直切片验收脚本（在学校服务器上对**运行中的真实 API** 执行）。
 *
 * 与 Jest 集成测试不同，本脚本验证的是「真实部署 + 真实种子数据 + 真实图片文件」：
 *   后台上架真实商品 → 顾客端看到真实图片 → 提交真实量体申请 → 审核 → 报价 → 确认 → 订单 → 发货
 * 同时验证图片文件确实可从受控文件存储读取。
 *
 * 用法：node infra/scripts/acceptance.mjs [apiBaseUrl]
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = (process.argv[2] ?? process.env.API_BASE ?? 'http://127.0.0.1:18110/api/v1').replace(/\/$/, '');
const REPO = resolve(import.meta.dirname, '../..');

const envFile = resolve(REPO, 'infra/docker/.env');
const env = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
}
const ADMIN_USER = process.env.SEED_OWNER_USERNAME ?? 'owner';
const ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD ?? 'Qinyang@2026';

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function call(path, { method = 'GET', body, token, customerToken, raw = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (customerToken) headers['x-customer-token'] = customerToken;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON */
  }
  if (raw) return { status: res.status, text, json };
  return { status: res.status, body: json, headers: res.headers };
}

const run = async () => {
  console.log(`\n=== 琴扬商城 V1 垂直切片验收 ===`);
  console.log(`目标：${BASE}\n`);

  // 1. 健康检查
  const health = await call('/health');
  record('API 健康检查', health.status === 200 && health.body?.data?.status === 'ok');

  // 2. 管理员登录
  const login = await call('/admin/auth/login', {
    method: 'POST',
    body: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  const ownerToken = login.body?.data?.token;
  record(
    '店主登录并取得令牌',
    login.status === 200 && Boolean(ownerToken),
    login.status === 200 ? `role=${login.body.data.user.role}` : login.body?.message,
  );
  if (!ownerToken) {
    console.error('登录失败，后续验收中止');
    process.exitCode = 1;
    return;
  }

  // 3. 上架全部种子商品（DRAFT → PENDING_REVIEW → PUBLISHED）
  const listRes = await call('/admin/products?pageSize=100', { token: ownerToken });
  const products = listRes.body?.data?.items ?? [];
  record('后台读取到种子商品', products.length > 0, `${products.length} 件`);

  let published = 0;
  for (const product of products) {
    for (const target of ['PENDING_REVIEW', 'PUBLISHED']) {
      const res = await call(`/admin/products/${product.id}/status`, {
        method: 'POST',
        body: { status: target },
        token: ownerToken,
      });
      if (res.status !== 200) break;
    }
    const check = await call(`/admin/products/${product.id}`, { token: ownerToken });
    if (check.body?.data?.status === 'PUBLISHED') published += 1;
  }
  record('全部商品经「提交审核 → 发布」上架', published === products.length, `${published}/${products.length}`);

  // 4. 公开商品接口
  const pubList = await call('/products?pageSize=100');
  const pubItems = pubList.body?.data?.items ?? [];
  record('顾客端商品列表返回已发布商品', pubList.status === 200 && pubItems.length > 0, `${pubItems.length} 件`);

  const withPrice = pubItems.filter((item) => item.priceCents !== null);
  record(
    '未确认价格的商品不显示价格（priceCents 为 null）',
    withPrice.length === 0,
    withPrice.length === 0 ? '全部为 null（前端显示「待报价」）' : `${withPrice.length} 件意外带价`,
  );

  const withCover = pubItems.filter((item) => Boolean(item.coverUrl));
  record('商品均有真实主图', withCover.length === pubItems.length, `${withCover.length}/${pubItems.length}`);

  // 5. 图片文件确实可从受控存储读取
  if (withCover.length > 0) {
    const sample = withCover[0];
    const imgRes = await fetch(sample.coverUrl, { method: 'GET' });
    const buf = Buffer.from(await imgRes.arrayBuffer());
    record(
      '主图文件可访问且非空',
      imgRes.status === 200 && buf.byteLength > 1024,
      `${sample.coverUrl} → ${imgRes.status}, ${(buf.byteLength / 1024).toFixed(0)}KB`,
    );
  }

  // 6. 搜索与分组筛选
  const first = pubItems[0];
  const search = await call(`/products?keyword=${encodeURIComponent(first.code)}`);
  record('商品搜索命中', (search.body?.data?.items?.length ?? 0) > 0, `keyword=${first.code}`);

  const groups = await call('/categories');
  const child = (groups.body?.data ?? []).flatMap((c) => c.children ?? [])[0];
  if (child) {
    const byGroup = await call(`/products?group=${encodeURIComponent(child.code)}`);
    record(
      '二级分组筛选生效',
      byGroup.status === 200 && Array.isArray(byGroup.body?.data?.items),
      `${child.code} → ${byGroup.body?.data?.items?.length ?? 0} 件`,
    );
  }

  // 7. 分类树
  record(
    '分类树含二级分组',
    (groups.body?.data?.length ?? 0) > 0 &&
      (groups.body?.data ?? []).some((c) => (c.children?.length ?? 0) > 0),
    `${groups.body?.data?.length ?? 0} 个一级分类`,
  );

  // 8. 图文指南
  for (const slug of ['measure-top', 'measure-bottom', 'care', 'material']) {
    const res = await call(`/guides/${slug}`);
    record(`图文说明页 ${slug}`, res.status === 200 && (res.body?.data?.sections?.length ?? 0) > 0);
  }

  // 9. 顾客登录
  const custLogin = await call('/auth/login', { method: 'POST', body: { code: `dev:acceptance-${Date.now()}` } });
  const customerToken = custLogin.body?.data?.token;
  record('顾客登录', custLogin.status === 200 && Boolean(customerToken));

  // 10. 量体模板解析
  const tpl = await call(`/measurement-templates/resolve?productId=${first.id}`);
  record(
    '按商品解析量体模板',
    tpl.status === 200 && (tpl.body?.data?.measurementSections?.length ?? 0) > 0,
    `template=${tpl.body?.data?.templateCode ?? '-'}`,
  );

  // 10.1 模板必须真的带得出量体字段。
  //     这条断言来自一次真实缺陷：模板以原型 snake_case 入库时，
  //     接口返回 measurementFields=undefined，顾客端表单渲染为空、
  //     提交的量体资料也是空的，而当时的验收因同样拿到空字段而"通过"。
  const tplSections = tpl.body?.data?.measurementSections ?? [];
  const tplFields = tplSections.flatMap((s) => s.measurementFields ?? []);
  const requiredFields = tplFields.filter((f) => f.required);
  record(
    '量体模板带得出可填字段与必填项',
    tplFields.length > 0 && requiredFields.length > 0,
    `字段 ${tplFields.length} 个（必填 ${requiredFields.length} 个）`,
  );

  // 11. 提交定制申请
  //     量体值按每个字段自己的 min/max 取中点并夹紧，
  //     不再靠硬编码猜测 —— 否则模板一改就可能越界被拒。
  const measurements = tplFields.map((f) => {
    const min = typeof f.min === 'number' ? f.min : null;
    const max = typeof f.max === 'number' ? f.max : null;
    let value = min !== null && max !== null ? (min + max) / 2 : 90;
    if (typeof f.step === 'number' && f.step > 0) {
      value = Math.round(value / f.step) * f.step;
    }
    if (min !== null && value < min) value = min;
    if (max !== null && value > max) value = max;
    return {
      fieldCode: f.fieldCode,
      fieldName: f.fieldName,
      measurementType: f.measurementType,
      unit: f.unit,
      value
    };
  });

  const submitId = `acceptance-${Date.now()}`;
  const created = await call('/customization-requests', {
    method: 'POST',
    body: {
      productId: first.id,
      measurements,
      contact: {
        name: '验收测试顾客（虚构）',
        phone: '13800000001',
        region: '内蒙古自治区 呼和浩特市',
        detail: '验收测试虚构地址',
      },
      remark: '验收测试备注',
      submitId,
    },
    customerToken,
  });
  record('顾客提交定制申请', created.status === 201, `状态=${created.body?.data?.status}`);
  const snapshotFields = created.body?.data?.measurements?.fields ?? [];
  record(
    '申请快照带回真实量体数值',
    snapshotFields.length > 0 && snapshotFields.every((f) => f.value !== null && f.value !== undefined),
    `快照字段 ${snapshotFields.length} 个`,
  );
  const requestId = created.body?.data?.id;

  // 12. 幂等
  const again = await call('/customization-requests', {
    method: 'POST',
    body: {
      productId: first.id,
      measurements,
      contact: {
        name: '验收测试顾客（虚构）',
        phone: '13800000001',
        region: '内蒙古自治区 呼和浩特市',
        detail: '验收测试虚构地址',
      },
      submitId,
    },
    customerToken,
  });
  record(
    '重复提交同一 submitId 幂等',
    again.status === 201 && again.body?.data?.id === requestId,
  );

  // 13. 店员审核
  const staffLogin = await call('/admin/auth/login', {
    method: 'POST',
    body: { username: process.env.SEED_STAFF_USERNAME ?? 'staff', password: ADMIN_PASS },
  });
  const staffToken = staffLogin.body?.data?.token;
  record('店员登录', Boolean(staffToken));

  const review = await call(`/admin/customization-requests/${requestId}/review`, {
    method: 'POST',
    body: { action: 'APPROVE', note: '验收通过' },
    token: staffToken,
  });
  record('店员审核通过', review.status === 200, `状态=${review.body?.data?.status}`);

  // 14. 报价（店主）
  const quote = await call(`/admin/customization-requests/${requestId}/quotes`, {
    method: 'POST',
    body: { amountCents: 128000, freightCents: 0, productionDays: 21, note: '验收报价' },
    token: ownerToken,
  });
  record('店主创建报价', quote.status === 201, `版本=${quote.body?.data?.version}`);
  const quoteId = quote.body?.data?.id;

  // 15. 顾客确认
  const confirm = await call(`/customization-requests/${requestId}/confirm-quote`, {
    method: 'POST',
    body: { quoteId, expectedVersion: quote.body?.data?.version },
    customerToken,
  });
  record('顾客确认报价', confirm.status === 200, `状态=${confirm.body?.data?.status}`);

  // 16. 生成订单
  const order = await call('/admin/orders', {
    method: 'POST',
    body: { requestId, quoteId },
    token: ownerToken,
  });
  record('由申请生成订单', order.status === 201, `订单=${order.body?.data?.orderNo}`);
  const orderId = order.body?.data?.id;

  // 17. 制作与发货
  await call(`/admin/orders/${orderId}/status`, {
    method: 'POST',
    body: { status: 'IN_PRODUCTION', note: '开始制作' },
    token: staffToken,
  });
  const ship = await call(`/admin/orders/${orderId}/ship`, {
    method: 'POST',
    body: { carrier: '顺丰速运', trackingNo: `SF${Date.now()}` },
    token: staffToken,
  });
  record('店员填写物流并发货', ship.status === 200, `状态=${ship.body?.data?.status}`);

  // 18. 顾客查看进度
  const mine = await call(`/orders/${orderId}`, { customerToken });
  record(
    '顾客查看订单进度',
    mine.status === 200 && (mine.body?.data?.events?.length ?? 0) >= 3,
    `${mine.body?.data?.events?.length ?? 0} 条进度`,
  );

  // 19. 支付红线
  const pay = await call(`/admin/orders/${orderId}/pay`, { method: 'POST', token: ownerToken });
  record('支付接口返回 PAYMENT_DISABLED', pay.status === 409 && pay.body?.code === 'PAYMENT_DISABLED');

  // 20. 审计
  const audit = await call('/admin/audit-logs?pageSize=100', { token: ownerToken });
  const actions = (audit.body?.data?.items ?? []).map((i) => i.action);
  record(
    '关键操作留有审计记录',
    ['quote.create', 'order.create', 'order.ship', 'product.status.published'].every((a) =>
      actions.includes(a),
    ),
    `${actions.length} 条`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== 结果：${results.length - failed.length}/${results.length} 项通过 ===`);
  if (failed.length > 0) {
    console.log('失败项：');
    for (const item of failed) console.log(`  - ${item.name} ${item.detail}`);
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error('验收脚本异常：', error);
  process.exitCode = 1;
});
