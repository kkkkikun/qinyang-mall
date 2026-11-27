#!/usr/bin/env node
/**
 * 管理后台页面级执行验证 —— 读路径与页面交互。
 *
 * 在 Node 里执行后台页面自己的代码，打真实 API，覆盖 9 个视图 + 框架布局。
 * 共享装置见 tools/lib/admin-runtime.mjs。
 *
 * 用法（服务器执行）：
 *   node tools/verify_admin_pages.mjs [apiBaseUrl]
 */

import {
  API_BASE,
  cleanupHarness,
  compileAdminWeb,
  createChecker,
  createSandbox,
  runView
} from './lib/admin-runtime.mjs';

const { check, finish } = createChecker();

const ADMIN_USER = process.env.SEED_OWNER_USERNAME ?? 'owner';
const ADMIN_PASS = process.env.SEED_ADMIN_PASSWORD ?? 'Qinyang@2026';

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
  console.log('=== 管理后台页面级执行验证（读路径） ===');
  console.log(`目标 API：${API_BASE}\n`);

  compileAdminWeb();

  const sandbox = createSandbox();

  try {
    // ── 1. 登录页：走页面自己的 handleSubmit ────────────────
    {
      const page = await runView(sandbox, 'LoginView');
      // 空表单提交 → 被页面自己拦住
      await page.handleSubmit();
      check('登录页：空表单被拦截', sandbox.lastMessage('error') === '请输入用户名与密码',
        sandbox.lastMessage('error') || '');

      // 错误密码 → 错误提示，不建立会话
      page.form.username = ADMIN_USER;
      page.form.password = 'wrong-password';
      await page.handleSubmit();
      check('登录页：错误密码给出错误提示', Boolean(sandbox.lastMessage('error')),
        sandbox.lastMessage('error') || '');
      check('登录页：错误密码不建立会话', !page.auth.isLoggedIn, 'isLoggedIn=false');

      // 正确密码 → 建立会话并跳转
      page.form.username = ADMIN_USER;
      page.form.password = ADMIN_PASS;
      await page.handleSubmit();
      await waitUntil(() => page.auth.isLoggedIn, 10000, '登录成功');
      check('登录页：正确凭据登录成功', page.auth.isLoggedIn === true,
        `${page.auth.displayName} / ${page.auth.roleLabel}`);
      check(
        '登录页：token 已写入本地存储',
        String(globalThis.localStorage.getItem('qy_admin_token') ?? '').length > 0,
        'qy_admin_token 已落盘'
      );
      check('登录页：成功提示与跳转',
        sandbox.lastMessage('success') === '登录成功' &&
          sandbox.navigations.some((n) => n.type === 'replace'),
        sandbox.navigations.map((n) => `${n.type}:${n.to}`).join(' | '));
    }

    // ── 2. 仪表盘 ────────────────────────────────────────────
    {
      const page = await runView(sandbox, 'DashboardView');
      check('仪表盘：统计数据已加载', Boolean(page.stats), JSON.stringify(page.stats).slice(0, 160));
      check('仪表盘：待审核申请计数有值', Number.isFinite(page.stats.pendingReview),
        `待审核=${page.stats.pendingReview}`);
      check('仪表盘：待报价申请计数有值', Number.isFinite(page.stats.pendingQuote),
        `待报价=${page.stats.pendingQuote}`);
      check('仪表盘：待确认报价计数有值', Number.isFinite(page.stats.quoted),
        `待确认=${page.stats.quoted}`);
      check('仪表盘：制作中订单计数有值', Number.isFinite(page.stats.inProduction),
        `制作中=${page.stats.inProduction}`);
      check('仪表盘：已发布与草稿商品计数有值',
        Number.isFinite(page.stats.publishedProducts) && Number.isFinite(page.stats.draftProducts),
        `已发布=${page.stats.publishedProducts} 草稿=${page.stats.draftProducts}`);
      check('仪表盘：启用中轮播计数有值', Number.isFinite(page.stats.activeBanners),
        `轮播=${page.stats.activeBanners}`);
      check('仪表盘：待办列表已加载',
        Array.isArray(page.pendingReviewList) && Array.isArray(page.pendingQuoteList),
        `待审核 ${page.pendingReviewList.length} 条 / 待报价 ${page.pendingQuoteList.length} 条`);
      check('仪表盘：跳转方法可用', typeof page.goRequests === 'function' && typeof page.goOrders === 'function',
        '');
    }

    // ── 3. 商品列表 ──────────────────────────────────────────
    {
      const page = await runView(sandbox, 'ProductListView');
      check('商品列表：加载到商品', page.rows.length > 0, `${page.rows.length} 行`);
      check('商品列表：表格数据已构造', page.tableData.length > 0, `${page.tableData.length} 行`);
      check('商品列表：分类与量体模板下拉有数据',
        page.categories.length > 0 && page.templates.length > 0,
        `分类 ${page.categories.length} / 模板 ${page.templates.length}`);
      check('商品列表：状态与报价模式选项齐全',
        page.statusOptions.length > 0 && page.pricingOptions.length > 0,
        `状态 ${page.statusOptions.length} / 报价模式 ${page.pricingOptions.length}`);
      check('商品列表：店主拥有上下架权限', page.can('product.status') === true,
        `product.status=${page.can('product.status')}`);
      check('商品列表：未确认价格一律为 null（前端显示「待报价」）',
        page.rows.every((row) => row.priceCents === null),
        page.rows.slice(0, 2).map((row) => `${row.code}:${row.pricingMode}:${row.priceCents}`).join(' '));
    }

    // ── 4. 商品详情（抽屉）────────────────────────────────────
    {
      const page = await runView(sandbox, 'ProductListView');
      // 取带主图的商品（验证用的商品没有图集，断言图集对它没有意义）
      const target = page.rows.find((row) => row.coverUrl) ?? page.rows[0];
      await page.openEdit(target);
      await waitUntil(() => page.detailCache !== null, 15000, '商品详情');
      const detail = page.detailCache;
      check('商品详情抽屉：加载到商品', Boolean(detail && detail.id), detail?.code ?? '');
      check('商品详情抽屉：带出量体模板名称', Boolean(detail?.measurementTemplateName),
        detail?.measurementTemplateName ?? '');
      check('商品详情抽屉：图集有数据', (page.detailMedia ?? []).length > 0,
        `${(page.detailMedia ?? []).length} 张`);
    }

    // ── 5. 分类管理 ──────────────────────────────────────────
    {
      const page = await runView(sandbox, 'CategoryView');
      check('分类管理：加载到分类', page.rows.length > 0, `${page.rows.length} 行`);
      check('分类管理：两级结构存在', page.tree.length > 0, `一级 ${page.tree.length} 个`);
      check('分类管理：店主有分类管理权限', page.can('category.manage') === true, '');
      check('分类管理：层级行已构造', page.tableData.length === page.rows.length,
        `表格 ${page.tableData.length} 行`);
    }

    // ── 6. 轮播管理 ──────────────────────────────────────────
    {
      const page = await runView(sandbox, 'BannerView');
      check('轮播管理：加载到轮播', page.rows.length > 0, `${page.rows.length} 条`);
      check('轮播管理：链接类型选项齐全', page.linkTypeOptions.length > 0,
        `${page.linkTypeOptions.length} 种`);
      check('轮播管理：状态选项齐全', page.statusOptions.length > 0,
        `${page.statusOptions.length} 种`);
      check('轮播管理：店主有轮播管理权限', page.can('banner.manage') === true, '');
    }

    // ── 7. 量体模板 ──────────────────────────────────────────
    {
      const page = await runView(sandbox, 'TemplateListView');
      check('量体模板：加载到模板', page.rows.length > 0, `${page.rows.length} 个`);
      check('量体模板：模板带得出量体字段',
        page.rows.every((row) => Array.isArray(row.measurementSections) && row.measurementSections.length > 0),
        `${page.rows.filter((row) => (row.measurementSections ?? []).length > 0).length}/${page.rows.length} 个模板有字段`);
      check('量体模板：量体类型选项齐全', page.measurementTypeOptions.length > 0,
        `${page.measurementTypeOptions.length} 种`);
      check('量体模板：业主有模板管理权限', page.can('template.manage') === true, '');
      page.openView(page.rows[0]);
      check('量体模板：查看抽屉可打开', page.viewVisible === true && Boolean(page.viewTemplate),
        page.viewTemplate?.name ?? '');
    }

    // ── 8. 定制申请 ──────────────────────────────────────────
    {
      const page = await runView(sandbox, 'RequestListView');
      check('定制申请：加载到申请', page.rows.length > 0, `${page.rows.length} 条`);
      check('定制申请：状态选项齐全', page.statusOptions.length > 0,
        `${page.statusOptions.length} 种`);
      check('定制申请：店主拥有报价与建单权限',
        page.can('request.quote') === true && page.can('request.order') === true,
        `quote=${page.can('request.quote')} order=${page.can('request.order')}`);
      if (page.rows.length > 0) {
        await page.openDetail(page.rows[0]);
        check('定制申请：详情抽屉加载到申请与报价历史',
          Boolean(page.detail) && Array.isArray(page.quotes),
          `报价版本 ${page.quotes.length} 条`);
        check('定制申请：详情抽屉可展示时间线', Array.isArray(page.timeline),
          `${page.timeline.length} 个节点`);
      }
    }

    // ── 9. 订单管理 ──────────────────────────────────────────
    {
      const page = await runView(sandbox, 'OrderListView');
      check('订单管理：加载到订单', page.rows.length > 0, `${page.rows.length} 条`);
      check('订单管理：状态选项齐全', page.statusOptions.length > 0,
        `${page.statusOptions.length} 种`);
      check('订单管理：店主拥有订单状态推进权限', page.can('order.status') === true, '');
      if (page.rows.length > 0) {
        await page.openDetail(page.rows[0]);
        check('订单管理：详情抽屉加载到订单', Boolean(page.detail), page.detail?.orderNo ?? '');
        check('订单管理：选中订单后可推进状态集合非空',
          Array.isArray(page.nextStatuses) && page.nextStatuses.length > 0,
          JSON.stringify(page.nextStatuses));
        check('订单管理：可推进状态有中文标签',
          page.nextStatusOptions.length > 0 &&
            page.nextStatusOptions.every((opt) => Boolean(opt.label)),
          page.nextStatusOptions.map((opt) => opt.label).join(' / '));
      }
    }

    // ── 10. 审计日志 ─────────────────────────────────────────
    {
      const page = await runView(sandbox, 'AuditLogView');
      check('审计日志：加载到记录', page.rows.length > 0, `${page.rows.length} 条`);
      check('审计日志：可查看详情（差异行）', typeof page.openDetail === 'function', '');
      if (page.rows.length > 0) {
        page.openDetail(page.rows[0]);
        check('审计日志：详情抽屉可打开', page.detailVisible === true && Boolean(page.detail),
          page.detail?.action ?? '');
        check('审计日志：详情可解析为差异行', Array.isArray(page.diffRows),
          `${page.diffRows.length} 行差异`);
      }
    }

    // ── 11. 框架布局 ─────────────────────────────────────────
    {
      const page = await runView(sandbox, 'AppLayout');
      check('框架布局：退出登录方法可用', typeof page.handleLogout === 'function', '');
      check('框架布局：菜单切换方法可用', typeof page.handleMenuChange === 'function', '');
      check('框架布局：读到当前登录人', page.auth.displayName !== '—', page.auth.displayName);
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
