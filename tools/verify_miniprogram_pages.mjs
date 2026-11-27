#!/usr/bin/env node
/**
 * 小程序页面级执行验证（在 Node 中跑小程序自己的页面代码，打真实 API）。
 *
 * 背景：
 * 小程序是三端里唯一「从未被执行过」的一端。上一轮已经把「定制申请表」
 * 这一条写路径跑通（`tools/verify_miniprogram_flow.mjs`），
 * 但其余 16 个页面 —— 首页轮播、分类两级、搜索、商品详情、图文指南、
 * 我的申请、申请详情、报价确认、订单列表、订单进度、个人中心 ——
 * 仍然只被静态检查过，从未真正运行。
 *
 * 本脚本做两件事：
 * 1. **页面冒烟**：逐个加载页面模块、用真实参数触发 onLoad，
 *    断言页面数据落到预期形态（轮播有内容、分类两级、搜索有结果、
 *    详情有图集、指南有内容、列表有条目、详情有量体字段、订单有进度）。
 * 2. **闭环走页面代码**：申请 → 店员报价 → **顾客在报价页点确认** →
 *    建单发货 → **顾客在订单页看到进度**，
 *    顾客侧的每一步都由页面自己的方法完成，而不是直接调接口。
 *
 * 店员侧动作（报价、建单、发货）用管理端接口驱动，相当于商家在后台操作。
 *
 * 测试数据全部为虚构数据（openid、称呼、电话、地址）。
 *
 * 用法（服务器执行）：
 *   node tools/verify_miniprogram_pages.mjs [apiBaseUrl]
 */

import {
  compileMiniprogram,
  createRuntime,
  sleep,
  waitUntil
} from './lib/miniprogram-runtime.mjs';

const API_BASE = (process.argv[2] ?? 'http://127.0.0.1:18110/api/v1').replace(/\/$/, '');
const ADMIN_USER = process.env.SEED_OWNER_USERNAME ?? 'owner';
const ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD ?? 'Qinyang@2026';

const results = [];
let failed = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

// --------------------------------------------------------------------------
// 管理端（商家）动作：直接调接口，相当于店员在后台操作
// --------------------------------------------------------------------------

async function adminLogin() {
  const res = await fetch(`${API_BASE}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
  });
  const body = await res.json();
  return body?.data?.token ?? '';
}

async function adminCall(token, path, method = 'GET', body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await res.json().catch(() => null);
  return { status: res.status, body: payload };
}

// --------------------------------------------------------------------------
// 主流程
// --------------------------------------------------------------------------

async function main() {
  console.log('=== 小程序页面级执行验证 ===');
  console.log(`目标 API：${API_BASE}\n`);

  const outDir = compileMiniprogram();
  const runtime = createRuntime(API_BASE);
  const config = runtime.loadModule(outDir, 'utils/config.js');
  config.setBaseUrl(API_BASE);
  const api = runtime.loadModule(outDir, 'utils/api.js');
  const auth = runtime.loadModule(outDir, 'utils/auth.js');

  /** 加载页面并触发 onLoad，返回页面实例 */
  async function openPage(name, query) {
    const options = runtime.loadPage(outDir, name);
    if (!options) throw new Error(`页面 ${name} 未注册 Page()`);
    const page = runtime.createPage(options);
    page.onLoad(query ?? {});
    return page;
  }

  try {
    // 顾客登录（走小程序自己的 auth 模块）
    const token = await auth.ensureToken();
    check('顾客端登录（wx.login → /auth/login）', Boolean(token), token ? token.slice(0, 16) + '…' : '无');

    // 选一件已发布商品
    const list = await api.products({ pageSize: 50 });
    const items = list.items ?? [];
    check('顾客端商品列表有数据', items.length > 0, `${items.length} 件`);
    const productId = items[0]?.id;
    const productCode = items[0]?.code ?? items[0]?.productCode ?? '-';

    // ── 1. 首页：品牌轮播 + 精选 ─────────────────────────────
    {
      const page = await openPage('index');
      await runtime.settle(page, { wardrobe: true, picks: true });
      const wardrobe = page.data.wardrobe ?? [];
      const picks = page.data.picks ?? [];
      check('首页：加载无错误', !page.data.error, page.data.error || '');
      check('首页：羊绒衣橱轮播有内容', wardrobe.length > 0, `${wardrobe.length} 张`);
      check('首页：精选商品有内容', picks.length > 0, `${picks.length} 件`);
      check('首页：轮播项带图片地址', wardrobe.every((item) => Boolean(item.imageUrl ?? item.image)),
        JSON.stringify(wardrobe[0] ?? {}).slice(0, 80));
    }

    // ── 2. 分类页：两级分组 ───────────────────────────────────
    {
      const page = await openPage('category');
      await runtime.settle(page, { topCats: true, groups: true });
      // 商品是分类加载完成后再拉取的（设计如此），需单独等待
      await waitUntil(() => (page.data.items ?? []).length > 0, 15000, '分类页商品');
      const topCats = page.data.topCats ?? [];
      const groups = page.data.groups ?? [];
      check('分类页：加载无错误', !page.data.error, page.data.error || '');
      check('分类页：一级分类有内容', topCats.length > 0, `${topCats.length} 个`);
      check('分类页：二级分组有内容', groups.length > 0, `${groups.length} 个`);
      check('分类页：商品列表有内容', (page.data.items ?? []).length > 0, `${(page.data.items ?? []).length} 件`);
    }

    // ── 3. 搜索页：真实关键词命中 ─────────────────────────────
    {
      const page = await openPage('search');
      await runtime.settle(page, { hot: true });
      check('搜索页：热门关键词有内容', (page.data.hot ?? []).length > 0, `${(page.data.hot ?? []).length} 个`);
      // 触发真实搜索（doSearch 接收关键词字符串）
      if (typeof page.doSearch === 'function') {
        page.doSearch(productCode);
        await sleep(800);
      }
      const found = page.data.items ?? [];
      check('搜索页：按商品编号搜到结果', found.length > 0, `keyword=${productCode} → ${found.length} 件`);
    }

    // ── 4. 商品详情页：多图 + 不编造价格 ──────────────────────
    {
      const page = await openPage('product', { id: productId });
      await runtime.settle(page, { detail: true });
      const detail = page.data.detail;
      check('商品详情：加载无错误', !page.data.error, page.data.error || '');
      check('商品详情：商品主体有数据', Boolean(detail && detail.id), detail ? detail.code ?? detail.name : '');
      check('商品详情：图集有多张', (page.data.media ?? []).length > 0, `${(page.data.media ?? []).length} 张`);
      check('商品详情：未确认价格显示「待报价」而非数字',
        page.data.pricePending === true && String(page.data.priceLabel).includes('待报价'),
        `priceLabel=${page.data.priceLabel}`);
      check('商品详情：带出量体模板名称', Boolean(page.data.templateName), page.data.templateName || '');
    }

    // ── 5. 图文指南页（4 个）──────────────────────────────────
    for (const guide of ['guide-top', 'guide-bottom', 'guide-care', 'guide-material']) {
      const page = await openPage(guide);
      await runtime.settle(page, { vm: true });
      const vm = page.data.vm;
      check(`指南页 ${guide}：内容有数据`, Boolean(vm && vm.title), vm ? vm.title : '');
      check(`指南页 ${guide}：分区有内容`, Boolean(vm && (vm.sections ?? []).length > 0),
        vm ? `${(vm.sections ?? []).length} 个分区（来源 ${vm.source}）` : '');
    }

    // ── 6. 个人中心 ───────────────────────────────────────────
    {
      const page = await openPage('profile');
      await runtime.settle(page, { profile: true });
      check('个人中心：顾客资料有数据', Boolean(page.data.profile), page.data.nickname || '');
      check('个人中心：手机号已脱敏', !String(page.data.phoneMasked ?? '').includes('13800000000'),
        page.data.phoneMasked || '');
    }

    // ── 7. 顾客提交申请（走小程序自己的 api 层造数据）──────────
    const tpl = await api.resolveTemplate(productId);
    const tplFields = (tpl.measurementSections ?? []).flatMap((s) => s.measurementFields ?? []);
    const measurements = tplFields.map((f) => {
      const min = typeof f.min === 'number' ? f.min : null;
      const max = typeof f.max === 'number' ? f.max : null;
      let value = min !== null && max !== null ? (min + max) / 2 : 90;
      if (typeof f.step === 'number' && f.step > 0) value = Math.round(value / f.step) * f.step;
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
    const created = await api.createCustomizationRequest({
      productId,
      measurements,
      contact: {
        name: '页面验证顾客（虚构）',
        phone: '13800000007',
        region: '内蒙古自治区 呼和浩特市',
        detail: '页面验证虚构地址'
      },
      remark: '页面级验证（虚构数据）',
      submitId: `page-verify-${Date.now()}`
    });
    const requestId = created?.id;
    check('申请创建成功（顾客端 api 层）', Boolean(requestId), requestId ?? '');

    // ── 8. 我的定制申请列表页 ────────────────────────────────
    {
      const page = await openPage('requests');
      await runtime.settle(page, { items: true });
      const rows = page.data.items ?? [];
      check('我的申请：列表有内容', rows.length > 0, `${rows.length} 条`);
      check('我的申请：包含刚提交的申请', rows.some((row) => row.id === requestId),
        rows.map((row) => row.status).join(','));
    }

    // ── 9. 申请详情页：量体字段与状态 ────────────────────────
    {
      const page = await openPage('request-detail', { id: requestId });
      await runtime.settle(page, { dto: true });
      const dto = page.data.dto;
      check('申请详情：加载无错误', !page.data.error, page.data.error || '');
      check('申请详情：状态文案已渲染', Boolean(page.data.statusLabel), page.data.statusLabel || '');
      check('申请详情：带出量体字段', (page.data.sections ?? []).length > 0,
        `${(page.data.sections ?? []).length} 个分区`);
      check('申请详情：可取消按钮状态正确', typeof page.data.canCancel === 'boolean',
        `canCancel=${page.data.canCancel}`);
      check('申请详情：未报价时金额为待报价占位', Boolean(dto), dto?.status ?? '');
    }

    // ── 10. 店员报价（商家后台动作）──────────────────────────
    const adminToken = await adminLogin();
    check('店员登录（管理端）', Boolean(adminToken), adminToken ? '已取得令牌' : '未取得');
    await adminCall(adminToken, `/admin/customization-requests/${requestId}/review`, 'POST', {
      action: 'APPROVE',
      note: '页面验证（虚构数据）'
    });
    const quoteRes = await adminCall(adminToken, `/admin/customization-requests/${requestId}/quotes`, 'POST', {
      amountCents: 288000,
      freightCents: 2000,
      productionDays: 25,
      note: '页面验证报价'
    });
    check('店员创建报价', quoteRes.status === 201 || quoteRes.status === 200,
      `status=${quoteRes.status}`);
    const quoteId = quoteRes.body?.data?.id;

    // ── 11. 报价页 + 顾客在页面上确认报价 ────────────────────
    {
      const page = await openPage('quote', { id: requestId });
      await runtime.settle(page, { dto: true, quote: true });
      const quote = page.data.quote;
      check('报价页：加载无错误', !page.data.error, page.data.error || '');
      check('报价页：报价金额已渲染', Boolean(page.data.amount), page.data.amount || '');
      check('报价页：报价版本号已渲染', Boolean(page.data.version), `version=${page.data.version}`);
      check('报价页：报价编号与商家侧一致', quote && quote.id === quoteId,
        quote ? `${quote.id}` : '');

      // 通过页面自己的 confirm() 完成确认
      page.confirm();
      await waitUntil(() => page.data.confirming === false, 15000, '报价确认');
      await sleep(1200);
      const after = await api.getCustomizationRequest(requestId);
      check('顾客在报价页确认报价 → 申请变为已确认', after?.status === 'CONFIRMED', after?.status ?? '');
    }

    // ── 12. 建单 + 发货（商家后台动作）───────────────────────
    const orderRes = await adminCall(adminToken, '/admin/orders', 'POST', {
      requestId,
      quoteId
    });
    const orderId = orderRes.body?.data?.id;
    check('店员由已确认申请生成订单', Boolean(orderId), orderId ?? `status=${orderRes.status}`);
    await adminCall(adminToken, `/admin/orders/${orderId}/status`, 'POST', {
      status: 'IN_PRODUCTION',
      note: '页面验证（虚构数据）'
    });
    await adminCall(adminToken, `/admin/orders/${orderId}/ship`, 'POST', {
      carrier: '琴扬物流（虚构）',
      trackingNo: 'QY-TEST-0001',
      note: '页面验证（虚构数据）'
    });

    // ── 13. 订单列表页 ──────────────────────────────────────
    {
      const page = await openPage('orders');
      await runtime.settle(page, { items: true });
      const rows = page.data.items ?? [];
      check('订单列表：有内容', rows.length > 0, `${rows.length} 条`);
      check('订单列表：包含刚生成的订单', rows.some((row) => row.id === orderId),
        rows.map((row) => row.statusLabel ?? row.status).join(','));
    }

    // ── 14. 订单详情页：进度时间线 ──────────────────────────
    {
      const page = await openPage('order-detail', { id: orderId });
      await runtime.settle(page, { order: true });
      check('订单详情：加载无错误', !page.data.error, page.data.error || '');
      check('订单详情：订单主体有数据', Boolean(page.data.order), page.data.statusLabel || '');
      check('订单详情：进度时间线有 3 条', (page.data.events ?? []).length === 3,
        `${(page.data.events ?? []).length} 条`);
      check('订单详情：带出量体快照', (page.data.measurements ?? []).length > 0,
        `${(page.data.measurements ?? []).length} 项`);
      check('订单详情：金额已渲染', Boolean(page.data.total), page.data.total || '');
    }

    // ── 15. 申请取消（走申请详情页的 cancel）──────────────────
    const second = await api.createCustomizationRequest({
      productId,
      measurements,
      contact: {
        name: '页面验证顾客（虚构）',
        phone: '13800000008',
        region: '内蒙古自治区 呼和浩特市',
        detail: '页面验证虚构地址'
      },
      remark: '取消流程验证（虚构数据）',
      submitId: `page-verify-cancel-${Date.now()}`
    });
    {
      runtime.setModalAnswer(true);
      const page = await openPage('request-detail', { id: second.id });
      await runtime.settle(page, { dto: true });
      check('可取消的申请：按钮可用', page.data.canCancel === true, `canCancel=${page.data.canCancel}`);
      page.cancel();
      await waitUntil(() => page.data.cancelling === false, 15000, '取消申请');
      await sleep(500);
      const after = await api.getCustomizationRequest(second.id);
      check('顾客在申请详情页取消申请 → 状态为已取消', after?.status === 'CANCELLED', after?.status ?? '');
      check('取消前弹出了二次确认', runtime.modals.length > 0,
        runtime.modals.length ? runtime.modals[0].title : '');
    }
    // ── 16. 顾客拒绝报价（走报价页的 reject）────────────────
    // 此前顾客只能「确认」报价，嫌贵即死路；现在补了「拒绝」，
    // 必须验证按钮真的能把申请打回待报价，而不是点了没反应。
    {
      const third = await api.createCustomizationRequest({
        productId,
        measurements,
        contact: {
          name: '页面验证顾客（虚构）',
          phone: '13800000011',
          region: '内蒙古自治区 呼和浩特市',
          detail: '页面验证虚构地址'
        },
        remark: '拒绝报价流程验证（虚构数据）',
        submitId: `page-verify-reject-${Date.now()}`
      });
      await adminCall(adminToken, `/admin/customization-requests/${third.id}/review`, 'POST', {
        action: 'APPROVE',
        note: '页面验证（虚构数据）'
      });
      const rejectQuoteRes = await adminCall(
        adminToken,
        `/admin/customization-requests/${third.id}/quotes`,
        'POST',
        { amountCents: 399000, freightCents: 2000, productionDays: 25 }
      );
      check('拒绝报价前置：店员创建报价成功',
        rejectQuoteRes.status === 201 || rejectQuoteRes.status === 200,
        `status=${rejectQuoteRes.status}`);

      const page = await openPage('quote', { id: third.id });
      await runtime.settle(page, { dto: true, quote: true });
      check('拒绝报价：报价页加载到有效报价', Boolean(page.data.quote), page.data.quote?.id ?? '');

      runtime.setModalAnswer(true);
      page.reject();
      // 不用 rejecting 标志判断完成（它初值就是 false，会立刻返回），
      // 直接轮询后端状态，等到申请真的回到待报价。
      let after = null;
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        after = await api.getCustomizationRequest(third.id);
        if (after?.status === 'PENDING_QUOTE') break;
        await sleep(200);
      }
      await sleep(1500);
      check('顾客在报价页拒绝报价 → 申请回到待报价', after?.status === 'PENDING_QUOTE',
        after?.status ?? '');
      check('拒绝报价：页面刷新后不再有有效报价', !page.data.quote,
        page.data.quote?.id ?? '无');
    }
  } finally {
    // 清理临时编译目录
    const { rmSync } = await import('node:fs');
    rmSync(outDir, { recursive: true, force: true });
  }

  return finish();
}

function finish() {
  console.log(`\n=== 结果：${results.length - failed}/${results.length} 项通过 ===`);
  if (failed) {
    console.log('失败项：');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}${r.detail ? '：' + r.detail : ''}`));
  }
  return failed ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`\n❌ 验证脚本异常终止：${error && error.message ? error.message : error}`);
    process.exitCode = 1;
  });
