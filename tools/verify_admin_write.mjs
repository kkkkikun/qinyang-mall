#!/usr/bin/env node
/**
 * 管理后台页面级执行验证 —— 写路径（商家真实动线）。
 *
 * 读路径能证明「页面看得见数据」，写路径才能证明「商家用得动后台」。
 * 这里把后台最关键的一条链路完整走一遍，全部**调用页面自己的方法**：
 *
 *   顾客提交申请（顾客侧 API，只因小程序已有独立的页面级验证）
 *     → 后台：审核通过 → 创建报价（并验证金额校验拦截）
 *     → 顾客确认报价（顾客侧 API）
 *     → 后台：由申请生成订单
 *     → 后台：推进订单状态 → 填写物流发货
 *
 * 另外单独覆盖后台四个配置页的增删改：
 *   分类管理、轮播管理、商品管理、量体模板。
 *
 * 所有验证数据均为「验证用虚构数据」，带唯一前缀并在结束时删除；
 * 不使用任何真实顾客数据。
 *
 * 用法（服务器执行）：
 *   node tools/verify_admin_write.mjs [apiBaseUrl]
 */

import {
  API_BASE,
  cleanupHarness,
  compileAdminWeb,
  createChecker,
  createSandbox,
  runComponent,
  runView
} from './lib/admin-runtime.mjs';

const { check, finish } = createChecker();

const ADMIN_USER = process.env.SEED_OWNER_USERNAME ?? 'owner';
const ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD ?? 'Qinyang@2026';
const STAMP = String(Date.now()).slice(-8);

/** 顾客侧 / 公共接口调用（后台页面自身不提供这些入口） */
async function call(path, { method = 'GET', body, token, customerToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (customerToken) headers['x-customer-token'] = customerToken;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  return { status: res.status, body: payload };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(predicate, timeoutMs = 15000, label = '条件') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(30);
  }
  throw new Error(`等待超时：${label}`);
}

async function main() {
  console.log('=== 管理后台页面级执行验证（写路径） ===');
  console.log(`目标 API：${API_BASE}`);
  console.log(`验证标记：VERIFY-${STAMP}\n`);

  compileAdminWeb();

  const sandbox = createSandbox();

  try {
    // ── 0. 登录（走登录页自己的 handleSubmit）───────────────
    {
      const page = await runView(sandbox, 'LoginView');
      page.form.username = ADMIN_USER;
      page.form.password = ADMIN_PASS;
      await page.handleSubmit();
      await waitUntil(() => page.auth.isLoggedIn, 10000, '登录成功');
      check('写路径前置：管理员登录成功', page.auth.isLoggedIn === true, page.auth.roleLabel);
    }

    // ── 1. 商品管理：新建 → 编辑 → 提交审核 → 发布 ──────────
    let productId = '';
    {
      const page = await runView(sandbox, 'ProductListView');

      // 必填项缺失 → 页面自己拦住
      sandbox.clearMessages();
      page.openCreate();
      page.form.code = '';
      page.form.name = '';
      await page.handleSave();
      check('商品管理：缺少编号与名称被页面拦截',
        sandbox.lastMessage('error') === '请填写商品编号、名称并选择分类',
        sandbox.lastMessage('error') || '');

      // 正常新建（仅按量体报价，不填价格）
      // 排序值取到末尾，避免验证商品挤到商家列表顶部
      sandbox.clearMessages();
      page.form.code = `VERIFY-P-${STAMP}`;
      page.form.name = `验证商品（虚构 ${STAMP}）`;
      page.form.pricingMode = 'QUOTE_ONLY';
      page.form.priceYuan = '';
      page.form.measurementTemplateId = page.templates[0]?.id ?? '';
      page.form.sortOrder = '9999';
      await page.handleSave();
      check('商品管理：新建商品成功',
        sandbox.lastMessage('success') === '商品已创建（初始为草稿）',
        sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');

      // 列表按 sortOrder 升序排列，验证商品在末页，用关键字定位
      page.filters.keyword = 'VERIFY-P-';
      await page.load();
      const created = page.rows.find((row) => row.code === `VERIFY-P-${STAMP}`);
      check('商品管理：新建商品出现在列表', Boolean(created),
        created ? `id=${created.id} 状态=${created.status}` : '列表中未找到');
      check('商品管理：仅按量体报价的商品价格为空',
        Boolean(created) && created.priceCents === null,
        created ? `priceCents=${created.priceCents}` : '');
      productId = created?.id ?? '';

      if (created) {
        // 编辑（此前从未被执行过的路径）
        sandbox.clearMessages();
        await page.openEdit(created);
        page.form.name = `验证商品（已改名 ${STAMP}）`;
        await page.handleSave();
        check('商品管理：编辑商品成功', sandbox.lastMessage('success') === '商品已更新',
          sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');

        await page.load();
        const renamed = page.rows.find((row) => row.id === created.id);
        check('商品管理：改名已生效', renamed?.name === `验证商品（已改名 ${STAMP}）`,
          renamed?.name ?? '');

        // 状态流转：草稿 → 待审核 → 已发布
        sandbox.clearMessages();
        await page.handleStatusChange(renamed, 'PENDING_REVIEW');
        check('商品管理：草稿提交审核',
          sandbox.lastMessage('success') === '已更新为「待审核」',
          sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');

        await page.load();
        const reviewed = page.rows.find((row) => row.id === created.id);
        sandbox.clearMessages();
        await page.handleStatusChange(reviewed, 'PUBLISHED');
        check('商品管理：待审核商品发布',
          sandbox.lastMessage('success') === '已更新为「已发布」',
          sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');

        await page.load();
        const published = page.rows.find((row) => row.id === created.id);
        check('商品管理：商品状态已落到已发布', published?.status === 'PUBLISHED',
          published?.status ?? '');
      }
    }

    // ── 2. 分类管理：新建 → 编辑 → 删除 ─────────────────────
    {
      const page = await runView(sandbox, 'CategoryView');
      const before = page.rows.length;

      sandbox.clearMessages();
      page.openCreate();
      page.form.code = `VERIFY-C-${STAMP}`;
      page.form.name = `验证分类（虚构 ${STAMP}）`;
      page.form.parentId = '';
      page.form.sortOrder = '99';
      page.form.status = 'ACTIVE';
      await page.handleSave();
      check('分类管理：新建分类成功', sandbox.lastMessage('success') === '分类已创建',
        sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');

      await page.load();
      const created = page.rows.find((row) => row.code === `VERIFY-C-${STAMP}`);
      check('分类管理：新建分类出现在列表',
        Boolean(created) && page.rows.length === before + 1,
        `列表 ${page.rows.length} 行（新增前 ${before} 行）`);

      if (created) {
        sandbox.clearMessages();
        page.openEdit(created);
        page.form.name = `验证分类（已改名 ${STAMP}）`;
        await page.handleSave();
        check('分类管理：编辑分类成功', sandbox.lastMessage('success') === '分类已更新',
          sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');

        await page.load();
        const renamed = page.rows.find((row) => row.id === created.id);
        check('分类管理：改名已生效', renamed?.name === `验证分类（已改名 ${STAMP}）`,
          renamed?.name ?? '');

        sandbox.clearMessages();
        await page.handleRemove(renamed);
        check('分类管理：删除分类成功', sandbox.lastMessage('success') === '分类已删除',
          sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');
        await page.load();
        check('分类管理：删除后列表恢复原状',
          !page.rows.some((row) => row.id === created.id) && page.rows.length === before,
          `列表 ${page.rows.length} 行`);
      }
    }

    // ── 3. 轮播管理：新建 → 停用 → 删除 ─────────────────────
    {
      const page = await runView(sandbox, 'BannerView');
      const before = page.rows.length;

      sandbox.clearMessages();
      page.openCreate();
      page.form.title = `验证轮播（虚构 ${STAMP}）`;
      page.form.imageUrl = `/static/verify/banner-${STAMP}.jpg`;
      page.form.linkType = 'NONE';
      page.form.sortOrder = '99';
      page.form.status = 'ACTIVE';
      await page.handleSave();
      check('轮播管理：新建轮播成功', sandbox.lastMessage('success') === '轮播已创建',
        sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');

      await page.load();
      const created = page.rows.find((row) => row.title === `验证轮播（虚构 ${STAMP}）`);
      check('轮播管理：新建轮播出现在列表', Boolean(created), `${page.rows.length} 条`);

      if (created) {
        // 停用（页面不弹提示，只刷新列表，因此断言数据本身）
        await page.handleToggleStatus(created, false);
        await page.load();
        const disabled = page.rows.find((row) => row.id === created.id);
        check('轮播管理：停用后状态为已停用', disabled?.status === 'DISABLED',
          disabled?.status ?? '');

        sandbox.clearMessages();
        await page.handleRemove(disabled);
        check('轮播管理：删除轮播成功', sandbox.lastMessage('success') === '轮播已删除',
          sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');
        await page.load();
        check('轮播管理：删除后列表恢复原状',
          !page.rows.some((row) => row.id === created.id) && page.rows.length === before,
          `列表 ${page.rows.length} 条`);
      }
    }

    // ── 4. 量体模板：新建（草稿）→ 发布 ─────────────────────
    {
      const page = await runView(sandbox, 'TemplateListView');
      const before = page.rows.length;
      // 量体类型取值以契约为准（枚举键大写、值小写：body / garment_flat）
      const { MeasurementType } = sandbox.requireFromOut('@qinyang/contracts');

      sandbox.clearMessages();
      page.openCreate();
      page.form.code = `VERIFY-T-${STAMP}`;
      page.form.name = `验证模板（虚构 ${STAMP}）`;
      page.form.summary = '自动化验证用虚构模板';
      page.form.publish = false;
      page.form.sections = [
        {
          sectionId: `section-verify-${STAMP}`,
          title: '验证分节',
          measurementType: MeasurementType.BODY,
          description: '验证用',
          fields: [
            {
              fieldCode: `verify_field_${STAMP}`,
              fieldName: '验证字段',
              unit: 'cm',
              required: true,
              min: '10',
              max: '200',
              step: '1',
              instruction: '验证用'
            }
          ]
        }
      ];
      await page.handleSave();
      check('量体模板：新建模板（草稿）成功',
        sandbox.lastMessage('success') === '模板草稿已创建',
        sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');

      await page.load();
      const created = page.rows.find((row) => row.code === `VERIFY-T-${STAMP}`);
      check('量体模板：新模板出现在列表', Boolean(created),
        `${page.rows.length} 个（新增前 ${before} 个）`);
      check('量体模板：新模板带得出量体字段',
        Boolean(created) && (created.measurementSections ?? []).length === 1 &&
          (created.measurementSections[0].measurementFields ?? []).length === 1,
        created ? `分节 ${created.measurementSections?.length} / 字段 ${created.measurementSections?.[0]?.measurementFields?.length}` : '');

      if (created) {
        sandbox.clearMessages();
        await page.handlePublish(created);
        check('量体模板：发布模板成功',
          String(sandbox.lastMessage('success') ?? '').startsWith('已发布：'),
          sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');
        await page.load();
        const published = page.rows.find((row) => row.id === created.id);
        // 模板契约里的「已发布」态是 ACTIVE（草稿 / 已发布 / 已归档）
        check('量体模板：模板状态已落到已发布', published?.status === 'ACTIVE',
          published?.status ?? '');
      }
    }

    // ── 5. 定制申请闭环：审核 → 报价 → 建单 ─────────────────
    // 顾客侧动作（提交申请、确认报价）走顾客 API：
    // 顾客端已有独立的小程序页面级执行验证，这里不重复。
    let requestId = '';
    let quoteId = '';
    let quoteVersion = 0;
    {
      // 5.1 顾客登录并提交申请
      const custLogin = await call('/auth/login', {
        method: 'POST',
        body: { code: `dev:verify-admin-${STAMP}` }
      });
      const customerToken = custLogin.body?.data?.token;
      check('申请闭环前置：顾客登录成功', Boolean(customerToken));

      // 取一个有量体模板的已发布商品
      const products = await call('/admin/products?status=PUBLISHED&pageSize=20', {
        token: globalThis.localStorage.getItem('qy_admin_token')
      });
      const productItems = products.body?.data?.items ?? [];
      check('申请闭环前置：有已发布商品可用于下单', productItems.length > 0,
        `${productItems.length} 件`);

      const target = productItems.find((item) => item.id === productId) ?? productItems[0];
      const resolved = await call(`/measurement-templates/resolve?productId=${target.id}`);
      const sections = resolved.body?.data?.measurementSections ?? [];
      const fields = sections.flatMap((section) => section.measurementFields ?? []);
      check('申请闭环前置：商品可解析出量体模板', fields.length > 0, `${fields.length} 个字段`);

      const measurements = fields.map((field) => {
        let value = 100;
        if (field.min !== null && field.min !== undefined) value = Math.max(value, field.min);
        if (field.max !== null && field.max !== undefined) value = Math.min(value, field.max);
        if (field.step) value = Math.round(value / field.step) * field.step;
        return {
          fieldCode: field.fieldCode,
          fieldName: field.fieldName,
          measurementType: field.measurementType,
          unit: field.unit,
          value
        };
      });

      const created = await call('/customization-requests', {
        method: 'POST',
        customerToken,
        body: {
          productId: target.id,
          measurements,
          contact: {
            name: '验证顾客（虚构）',
            phone: '13800000002',
            region: '内蒙古自治区 呼和浩特市',
            detail: '自动化验证用虚构地址'
          },
          remark: '自动化验证（虚构数据）',
          submitId: `verify-admin-${STAMP}`
        }
      });
      requestId = created.body?.data?.id ?? '';
      check('申请闭环前置：顾客申请已创建',
        created.status === 201 && Boolean(requestId),
        created.body?.data?.requestNo ?? `HTTP ${created.status}`);
      check('申请闭环前置：申请初始为待审核',
        created.body?.data?.status === 'PENDING_REVIEW',
        created.body?.data?.status ?? '');
    }

    {
      // 5.2 后台：审核通过
      const page = await runView(sandbox, 'RequestListView');
      await page.load();
      const row = page.rows.find((item) => item.id === requestId);
      check('定制申请：待审核申请出现在后台列表', Boolean(row), row?.requestNo ?? '');

      await page.openDetail(row);
      check('定制申请：详情加载到该申请', page.detail?.id === requestId, page.detail?.requestNo ?? '');

      sandbox.clearMessages();
      page.openReview('APPROVE');
      page.reviewNote = '自动化验证审核通过';
      await page.handleSubmitReview();
      check('定制申请：审核通过', sandbox.lastMessage('success') === '已审核通过',
        sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');
      check('定制申请：审核后状态变为待报价', page.detail?.status === 'PENDING_QUOTE',
        page.detail?.status ?? '');

      // 5.3 后台：报价（金额校验拦截 + 正常报价）
      sandbox.clearMessages();
      page.openQuoteDialog();
      page.quoteForm.amountYuan = '0';
      page.quoteForm.freightYuan = '0';
      page.quoteForm.productionDays = '21';
      await page.handleSubmitQuote();
      check('定制申请：无效货款金额被拦截',
        sandbox.lastMessage('error') === '请输入有效的货款金额（单位：元）',
        sandbox.lastMessage('error') || '');
      check('定制申请：金额非法时未产生报价', page.quotes.length === 0,
        `${page.quotes.length} 条报价`);

      sandbox.clearMessages();
      page.openQuoteDialog();
      page.quoteForm.amountYuan = '1288.00';
      page.quoteForm.freightYuan = '0';
      page.quoteForm.productionDays = '21';
      await page.handleSubmitQuote();
      check('定制申请：创建报价成功', sandbox.lastMessage('success') === '报价已创建',
        sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');
      check('定制申请：报价历史出现版本', page.quotes.length >= 1,
        `${page.quotes.length} 条报价`);
      check('定制申请：报价后状态变为已报价', page.detail?.status === 'QUOTED',
        page.detail?.status ?? '');
      quoteId = page.quotes[page.quotes.length - 1]?.id ?? '';
      quoteVersion = page.quotes[page.quotes.length - 1]?.version ?? 0;
    }

    {
      // 5.4 顾客确认报价（顾客侧动作）
      const custLogin = await call('/auth/login', {
        method: 'POST',
        body: { code: `dev:verify-admin-${STAMP}` }
      });
      const customerToken = custLogin.body?.data?.token;
      const confirm = await call(`/customization-requests/${requestId}/confirm-quote`, {
        method: 'POST',
        customerToken,
        body: { quoteId, expectedVersion: quoteVersion }
      });
      check('申请闭环前置：顾客确认报价成功',
        confirm.status === 200 && confirm.body?.data?.status === 'ACTIVE',
        confirm.body?.data?.status ?? `HTTP ${confirm.status}`);
      // 确认报价的接口返回的是报价对象，申请状态需另行核对
      const afterConfirm = await call(`/admin/customization-requests/${requestId}`, {
        token: globalThis.localStorage.getItem('qy_admin_token')
      });
      check('申请闭环前置：申请状态已变为已确认',
        afterConfirm.body?.data?.status === 'CONFIRMED',
        afterConfirm.body?.data?.status ?? `HTTP ${afterConfirm.status}`);
    }

    let orderId = '';
    {
      // 5.5 后台：由申请生成订单
      const page = await runView(sandbox, 'RequestListView');
      await page.load();
      const row = page.rows.find((item) => item.id === requestId);
      await page.openDetail(row);
      check('定制申请：确认后可建单（页面判定可建单）', page.canCreateOrder === true,
        `canCreateOrder=${page.canCreateOrder}`);

      sandbox.clearMessages();
      await page.handleCreateOrder();
      check('定制申请：由申请生成订单成功',
        String(sandbox.lastMessage('success') ?? '').includes('订单'),
        sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');
      orderId = page.detail?.orderId ?? '';
      check('定制申请：申请已关联订单', Boolean(orderId), orderId || '未关联');
    }

    {
      // 5.6 后台：推进订单状态 → 发货
      const page = await runView(sandbox, 'OrderListView');
      await page.load();
      const order = page.rows.find((item) => item.id === orderId);
      check('订单管理：新订单出现在列表', Boolean(order), order?.orderNo ?? '');

      await page.openDetail(order);
      check('订单管理：订单详情可推进状态',
        Array.isArray(page.nextStatuses) && page.nextStatuses.length > 0,
        JSON.stringify(page.nextStatuses));

      sandbox.clearMessages();
      page.openStatusDialog();
      // 发货前需先进入制作中（后端状态机要求），否则 ship 会被拒绝
      const targetStatus = page.nextStatuses.includes('IN_PRODUCTION')
        ? 'IN_PRODUCTION'
        : page.nextStatuses[0];
      page.statusForm.status = targetStatus;
      page.statusForm.note = '自动化验证推进';
      await page.handleSubmitStatus();
      check('订单管理：推进订单状态成功',
        sandbox.lastMessage('success') === '订单状态已更新',
        sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');
      check('订单管理：订单状态已落到目标状态',
        page.detail?.status === targetStatus,
        `${page.detail?.status ?? ''}（目标 ${targetStatus}）`);

      sandbox.clearMessages();
      page.openShipDialog();
      page.shipForm.carrier = '';
      page.shipForm.trackingNo = '';
      await page.handleSubmitShip();
      check('订单管理：物流信息不全时被拦截',
        sandbox.lastMessage('error') === '请填写物流公司与物流单号',
        sandbox.lastMessage('error') || '');

      sandbox.clearMessages();
      page.shipForm.carrier = '顺丰速运';
      page.shipForm.trackingNo = `SF${STAMP}`;
      await page.handleSubmitShip();
      check('订单管理：填写物流并发货成功',
        sandbox.lastMessage('success') === '物流信息已保存',
        sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');
      check('订单管理：订单状态已落到已发货', page.detail?.status === 'SHIPPED',
        page.detail?.status ?? '');
    }

    // ── 6. 撤回报价 / 退回重新报价（两个此前从未被测过的按钮）──
    // 背景：`QuotesAdminController` 写好了却没注册进任何模块，
    // `POST /admin/quotes/:id/withdraw` 线上永远 404 —— 后台「撤回报价」按钮是纯装饰。
    // 这类缺陷不会被「接口 200 + 类型全绿」发现，必须用页面自己的方法实测。
    {
      const adminToken = globalThis.localStorage.getItem('qy_admin_token');
      const custLogin = await call('/auth/login', {
        method: 'POST',
        body: { code: `dev:verify-admin-${STAMP}` }
      });
      const customerToken = custLogin.body?.data?.token;

      const products = await call('/admin/products?status=PUBLISHED&pageSize=20', {
        token: adminToken
      });
      const target = (products.body?.data?.items ?? [])[0];
      const resolved = await call(`/measurement-templates/resolve?productId=${target.id}`);
      const fields = (resolved.body?.data?.measurementSections ?? []).flatMap(
        (section) => section.measurementFields ?? []
      );
      const measurements = fields.map((field) => {
        let value = 100;
        if (field.min !== null && field.min !== undefined) value = Math.max(value, field.min);
        if (field.max !== null && field.max !== undefined) value = Math.min(value, field.max);
        if (field.step) value = Math.round(value / field.step) * field.step;
        return {
          fieldCode: field.fieldCode,
          fieldName: field.fieldName,
          measurementType: field.measurementType,
          unit: field.unit,
          value
        };
      });

      const created = await call('/customization-requests', {
        method: 'POST',
        customerToken,
        body: {
          productId: target.id,
          measurements,
          contact: {
            name: '验证顾客（虚构）',
            phone: '13800000009',
            region: '内蒙古自治区 呼和浩特市',
            detail: '自动化验证用虚构地址'
          },
          remark: '撤回报价验证（虚构数据）',
          submitId: `verify-withdraw-${STAMP}`
        }
      });
      const withdrawRequestId = created.body?.data?.id ?? '';
      check('撤回验证前置：申请已创建', Boolean(withdrawRequestId), withdrawRequestId);

      await call(`/admin/customization-requests/${withdrawRequestId}/review`, {
        method: 'POST',
        token: adminToken,
        body: { action: 'APPROVE', note: '自动化验证审核通过' }
      });
      const quoteRes = await call(`/admin/customization-requests/${withdrawRequestId}/quotes`, {
        method: 'POST',
        token: adminToken,
        body: { amountCents: 158000, freightCents: 1500, productionDays: 20 }
      });
      check('撤回验证前置：报价已创建', quoteRes.status === 201 || quoteRes.status === 200,
        `HTTP ${quoteRes.status}`);

      // 用页面自己的方法撤回（而不是直接调接口）—— 按钮才是商家真正会点的东西
      const page = await runView(sandbox, 'RequestListView');
      await page.load();
      const row = page.rows.find((item) => item.id === withdrawRequestId);
      await page.openDetail(row);
      const activeQuote = (page.quotes ?? []).find((quote) => quote.status === 'ACTIVE');
      check('撤回验证：页面拿到当前有效报价', Boolean(activeQuote), activeQuote?.id ?? '无');
      check('撤回验证：页面判定允许撤回', page.canWithdrawQuote === true,
        `canWithdrawQuote=${page.canWithdrawQuote}`);

      sandbox.clearMessages();
      await page.handleWithdrawQuote(activeQuote);
      check('撤回验证：页面撤回报价成功', sandbox.lastMessage('success') === '报价已撤回',
        sandbox.lastMessage('success') || sandbox.lastMessage('error') || '');
      check('撤回验证：申请状态回到待报价', page.detail?.status === 'PENDING_QUOTE',
        page.detail?.status ?? '');

      // 顾客已确认的申请不允许撤回（服务端守卫 + 页面按钮同步隐藏）
      const custLogin2 = await call('/auth/login', {
        method: 'POST',
        body: { code: `dev:verify-admin-${STAMP}` }
      });
      const customerToken2 = custLogin2.body?.data?.token;
      const created2 = await call('/customization-requests', {
        method: 'POST',
        customerToken: customerToken2,
        body: {
          productId: target.id,
          measurements,
          contact: {
            name: '验证顾客（虚构）',
            phone: '13800000010',
            region: '内蒙古自治区 呼和浩特市',
            detail: '自动化验证用虚构地址'
          },
          remark: '撤回守卫验证（虚构数据）',
          submitId: `verify-withdraw-guard-${STAMP}`
        }
      });
      const guardRequestId = created2.body?.data?.id ?? '';
      await call(`/admin/customization-requests/${guardRequestId}/review`, {
        method: 'POST',
        token: adminToken,
        body: { action: 'APPROVE', note: '自动化验证审核通过' }
      });
      const quote2 = await call(`/admin/customization-requests/${guardRequestId}/quotes`, {
        method: 'POST',
        token: adminToken,
        body: { amountCents: 158000, freightCents: 1500, productionDays: 20 }
      });
      await call(`/customization-requests/${guardRequestId}/confirm-quote`, {
        method: 'POST',
        customerToken: customerToken2,
        body: { quoteId: quote2.body?.data?.id, expectedVersion: quote2.body?.data?.version }
      });

      const guardPage = await runView(sandbox, 'RequestListView');
      await guardPage.load();
      const guardRow = guardPage.rows.find((item) => item.id === guardRequestId);
      await guardPage.openDetail(guardRow);
      check('撤回验证：已确认的申请页面不允许撤回', guardPage.canWithdrawQuote === false,
        `canWithdrawQuote=${guardPage.canWithdrawQuote}`);
      const withdrawAfterConfirm = await call(
        `/admin/quotes/${quote2.body?.data?.id}/withdraw`,
        { method: 'POST', token: adminToken }
      );
      check('撤回验证：已确认的报价服务端拒绝撤回', withdrawAfterConfirm.status === 409,
        `HTTP ${withdrawAfterConfirm.status}`);
    }

    // ── 7. 本轮新增的后台效率按钮（导出 / 批量 / 沿用上一版）────
    {
      // 7.1 申请列表：导出 CSV
      const page = await runView(sandbox, 'RequestListView');
      await page.load();
      sandbox.clearMessages();
      await page.handleExport();
      const exportMsg = sandbox.lastMessage('success') || sandbox.lastMessage('error') || '';
      check('申请列表：导出 CSV 按钮可用', exportMsg.startsWith('已导出') || exportMsg.includes('没有可导出'),
        exportMsg);

      // 7.2 报价弹窗：沿用上一版
      const rows = page.rows;
      const quoted = rows.find((row) => row.activeQuote);
      if (quoted) {
        await page.openDetail(quoted);
        page.openQuoteDialog();
        page.handleReuseLastQuote();
        check('定制申请：沿用上一版填入货款金额',
          Number(page.quoteForm.amountYuan) > 0,
          `amountYuan=${page.quoteForm.amountYuan}`);
        check('定制申请：沿用上一版填入制作周期',
          Number(page.quoteForm.productionDays) > 0,
          `productionDays=${page.quoteForm.productionDays}`);
      } else {
        check('定制申请：沿用上一版按钮在无历史报价时不出现', page.latestQuote === null,
          `latestQuote=${String(page.latestQuote)}`);
      }
    }

    {
      // 7.3 商品列表：批量上下架
      const page = await runView(sandbox, 'ProductListView');
      await page.load();
      page.filters.keyword = 'VERIFY-P-';
      await page.load();
      const targets = page.rows.filter((row) => row.code.startsWith('VERIFY-P-'));
      if (targets.length > 0) {
        page.handleSelectChange(targets.map((row) => row.id));
        check('商品管理：批量操作能选中多件', page.selectedIds.length === targets.length,
          `${page.selectedIds.length}/${targets.length}`);
        sandbox.clearMessages();
        await page.handleBatchStatus('PENDING_REVIEW');
        const msg = sandbox.lastMessage('success') || sandbox.lastMessage('warning') || sandbox.lastMessage('error') || '';
        check('商品管理：批量提交审核有明确结果', msg.includes('已更新') || msg.includes('未成功'),
          msg);
      } else {
        check('商品管理：批量操作前置（验证商品存在）', false, '未找到验证商品');
      }
    }

    // ── 8. 商品批量导入（CSV）─────────────────────────────────
    // 面板是**组件**而非页面，同样要在真实 API 上执行：
    // 只做类型检查是发现不了「按钮点了没反应 / 预检结果不对」这类死路的。
    {
      const adminToken = globalThis.localStorage.getItem('qy_admin_token');
      const cats = await call('/admin/categories', { token: adminToken });
      const list = Array.isArray(cats.body?.data) ? cats.body.data : [];
      const flat = [];
      const walk = (nodes) => {
        for (const node of nodes ?? []) {
          flat.push(node);
          walk(node.children);
        }
      };
      walk(list);
      const category = flat.find((item) => item.status === 'ACTIVE');
      const categoryCode = category?.code ?? '';

      const panel = await runComponent(sandbox, 'ProductImportPanel', {
        props: { visible: true }
      });

      // 模板下载：内容里必须有标准表头（否则商家根本不知道填什么列）
      sandbox.clearMessages();
      panel.handleDownloadTemplate();
      const templateMsg = sandbox.lastMessage('info') || '';
      check('批量导入：模板含标准表头',
        templateMsg.includes('商品编号') && templateMsg.includes('分类编号') && templateMsg.includes('价格(元)'),
        templateMsg.split('\n')[0]?.slice(0, 60) ?? '');

      if (!categoryCode) {
        check('批量导入：前置（存在可用分类）', false, '未找到 ACTIVE 分类');
      } else {
        const csv = [
          '商品编号,商品名称,分类编号,报价模式,价格(元),材质,副标题,商品简介,洗护说明,量体模板编号,排序',
          `VERIFY-IMP-${STAMP},验证导入商品,${categoryCode},仅按量体报价,,,,,,,9999`,
          `VERIFY-IMP-BAD-${STAMP},坏行商品,${categoryCode},仅按量体报价,199,,,,,`,
        ].join('\n');

        // 预检：只校验不落库
        sandbox.clearMessages();
        panel.csvText = csv;
        await panel.handlePreview();
        const preview = panel.result;
        check('批量导入：预检识别出错误行',
          Boolean(preview) && preview.dryRun === true && preview.failed === 1 && preview.pending === 1,
          preview ? `pending=${preview.pending} failed=${preview.failed}` : '无预检结果');
        check('批量导入：预检不落库',
          Boolean(preview) && preview.created === 0,
          preview ? `created=${preview.created}` : '');

        // 正式导入：好行成功、坏行失败
        sandbox.clearMessages();
        await panel.handleImport();
        const imported = panel.result;
        check('批量导入：正式导入好行成功、坏行失败',
          Boolean(imported) && imported.created === 1 && imported.failed === 1,
          imported ? `created=${imported.created} failed=${imported.failed}` : '无导入结果');

        // 导入结果能在商品列表里看到，且状态是草稿（没绕过店主审核）
        const listPage = await runView(sandbox, 'ProductListView');
        listPage.filters.keyword = `VERIFY-IMP-${STAMP}`;
        await listPage.load();
        const row = listPage.rows.find((item) => item.code === `VERIFY-IMP-${STAMP}`);
        check('批量导入：导入的商品出现在列表', Boolean(row),
          row ? `id=${row.id} 状态=${row.status}` : '列表中未找到');
        check('批量导入：导入商品状态为草稿', row?.status === 'DRAFT', `status=${row?.status}`);
      }
    }

    // ── 9. 收尾：验证商品下架并推到列表末尾 ──────────────────
    // 验证商品没有删除接口（商品只做下架归档），因此收尾时统一：
    // 下架 + 排序推到末尾，避免挤占商家真正要看的列表头部。
    {
      const page = await runView(sandbox, 'ProductListView');
      page.filters.keyword = 'VERIFY-';
      await page.load();
      const verifies = page.rows.filter((row) => row.code.startsWith('VERIFY-'));
      for (const row of verifies) {
        // 导入验证商品是草稿：草稿不能直接下架，需先提交审核再下架
        let status = row.status;
        if (status === 'DRAFT') {
          sandbox.clearMessages();
          await page.handleStatusChange(row, 'PENDING_REVIEW');
          status = 'PENDING_REVIEW';
        }
        if (status !== 'OFFLINE') {
          sandbox.clearMessages();
          await page.handleStatusChange(row, 'OFFLINE');
        }
        if (row.sortOrder !== 9999) {
          await page.openEdit(row);
          page.form.sortOrder = '9999';
          await page.handleSave();
        }
      }
      await page.load();
      const left = page.rows.filter((row) => row.code.startsWith('VERIFY-'));
      check('收尾：验证商品已全部下架并推到列表末尾',
        left.length > 0 && left.every((row) => row.status === 'OFFLINE' && row.sortOrder === 9999),
        `${left.length} 件验证商品`);
    }
  } finally {
    sandbox.restore();
    cleanupHarness();
  }

  return finish();
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`\n❌ 验证脚本异常终止：${error && error.stack ? error.stack : error}`);
    process.exitCode = 1;
  });
