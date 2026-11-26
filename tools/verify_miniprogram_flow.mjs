#!/usr/bin/env node
/**
 * 小程序真实流程验证（在小程序自己的代码上执行）。
 *
 * 背景：
 * 小程序是三端里唯一「从未被执行过」的一端 —— 微信开发者工具不在本环境，
 * 之前的验收全部是直接调用 HTTP 接口，**没有跑过一行小程序代码**。
 * 这类盲区的典型后果是：编译通过、页面能打开，但点下去就出错。
 * 本轮就抓到一个真实例子：`utils/format.ts` 里 `formatDate` 被声明了两次，
 * 后一个（Date 版）覆盖了对外导出的 string 版，任何外部调用都会崩。
 *
 * 本脚本的做法：
 * 1. 用工作区里的 tsc 把 `apps/miniprogram` 编译到临时目录（不做类型跳过，
 *    因此顺带把「小程序类型检查」也变成了一道真实关卡）；
 * 2. 注入 `wx` / `Page` / `App` 等小程序全局的桩件，其中 `wx.request`
 *    用 fetch 打到**真实运行中的 API**；
 * 3. 用小程序自己的 `utils/api.ts` 与 `pages/apply/apply.ts` 跑完
 *    「登录 → 取商品 → 解析量体模板 → 填表 → 校验 → 提交 → 幂等重提交」
 *    全流程，并对客户端校验与服务端校验的一致性做交叉断言。
 *
 * 测试数据全部为虚构数据（openid、称呼、电话、地址），不使用任何真实顾客资料。
 *
 * 用法（需在已安装依赖的环境执行，服务器上运行）：
 *   node tools/verify_miniprogram_flow.mjs [apiBaseUrl]
 * 默认基址：http://127.0.0.1:18110/api/v1
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = (process.argv[2] ?? 'http://127.0.0.1:18110/api/v1').replace(/\/$/, '');
const MOCK_CODE = 'dev:openid-mp-verify-001';

const results = [];
let failed = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
  const mark = ok ? '✅' : '❌';
  console.log(`${mark} ${name}${detail ? ' — ' + detail : ''}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(predicate, timeoutMs = 15000, label = '条件') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(25);
  }
  throw new Error(`等待超时：${label}`);
}

function deepClone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

/** 支持 'a.b' 与 'a[0].b' 形式的 setData 路径 */
function setPath(target, path, value) {
  const parts = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter((part) => part !== '');
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (cursor[key] === undefined || cursor[key] === null) {
      cursor[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

// --------------------------------------------------------------------------
// 小程序全局桩件
// --------------------------------------------------------------------------

const storage = new Map();
const toasts = [];
const navigations = [];

async function wxRequest(options) {
  const { url, method = 'GET', data, header = {}, success, fail } = options;
  try {
    let target = url;
    if (method === 'GET' && data && typeof data === 'object') {
      const qs = new URLSearchParams(data).toString();
      if (qs) target += (target.includes('?') ? '&' : '?') + qs;
    }
    const init = { method, headers: { ...header } };
    if (data !== undefined && data !== null && method !== 'GET') {
      init.body = JSON.stringify(data);
    }
    const response = await fetch(target, init);
    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    success &&
      success({
        statusCode: response.status,
        data: parsed,
        header: Object.fromEntries(response.headers.entries())
      });
  } catch (error) {
    fail && fail({ errMsg: String(error) });
  }
}

globalThis.wx = {
  getStorageSync: (key) => (storage.has(key) ? storage.get(key) : ''),
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
  showToast: (options) => toasts.push(options),
  showLoading: () => undefined,
  hideLoading: () => undefined,
  navigateTo: (options) => {
    navigations.push({ type: 'navigateTo', url: options.url });
    options.success && options.success({});
  },
  redirectTo: (options) => {
    navigations.push({ type: 'redirectTo', url: options.url });
    options.success && options.success({});
  },
  navigateBack: () => navigations.push({ type: 'navigateBack' }),
  login: (options) => {
    setTimeout(() => options.success && options.success({ code: MOCK_CODE }), 0);
  },
  getSystemInfoSync: () => ({
    statusBarHeight: 44,
    windowWidth: 390,
    windowHeight: 844,
    safeArea: { top: 44, bottom: 844, left: 0, right: 390, width: 390, height: 800 }
  }),
  getWindowInfo: () => ({
    statusBarHeight: 44,
    windowWidth: 390,
    windowHeight: 844,
    safeArea: { top: 44, bottom: 844, left: 0, right: 390, width: 390, height: 800 }
  }),
  getMenuButtonBoundingClientRect: () => ({
    top: 48,
    right: 366,
    bottom: 80,
    left: 318,
    width: 48,
    height: 32
  }),
  request: (options) => {
    void wxRequest(options);
  }
};

let pageOptions = null;
globalThis.Page = (options) => {
  pageOptions = options;
};
globalThis.App = () => undefined;
globalThis.getApp = () => ({ globalData: {} });
globalThis.getCurrentPages = () => [];

// --------------------------------------------------------------------------
// 编译小程序
// --------------------------------------------------------------------------

function locateTsc() {
  const candidates = [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(REPO, 'apps', 'api', 'node_modules', 'typescript', 'bin', 'tsc')
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function compileMiniprogram() {
  const tsc = locateTsc();
  if (!tsc) {
    throw new Error(
      '未找到 typescript 编译器：本脚本需要已安装依赖的环境（服务器）执行。\n' +
        '请在服务器上运行：node tools/verify_miniprogram_flow.mjs'
    );
  }
  const outDir = mkdtempSync(join(tmpdir(), 'qy-mp-'));
  try {
    execFileSync(
      process.execPath,
      [tsc, '-p', join(REPO, 'apps', 'miniprogram', 'tsconfig.json'), '--outDir', outDir],
      { cwd: REPO, encoding: 'utf-8', stdio: 'pipe' }
    );
  } catch (error) {
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    throw new Error(`小程序类型检查未通过，无法执行验证：\n${detail}`);
  }
  return outDir;
}

// --------------------------------------------------------------------------
// 主流程
// --------------------------------------------------------------------------

async function main() {
  console.log('=== 小程序真实流程验证（执行小程序自身代码） ===');
  console.log(`目标 API：${API_BASE}`);
  console.log(`模拟登录 code：${MOCK_CODE}（虚构数据）\n`);

  const outDir = compileMiniprogram();
  const require = createRequire(join(outDir, 'noop.js'));

  try {
    // 小程序自己的 API 层
    const api = require(join(outDir, 'utils', 'api.js'));

    // API 基址：小程序通过 wx.setStorageSync 覆盖，这里用小程序自己的接口设置
    const config = require(join(outDir, 'utils', 'config.js'));
    config.setBaseUrl(API_BASE);

    // 1. 顾客登录（走小程序自己的 auth 模块）
    const auth = require(join(outDir, 'utils', 'auth.js'));
    const token = await auth.ensureToken();
    check('顾客端 wx.login → POST /auth/login 取得 token', Boolean(token), token ? token.slice(0, 18) + '…' : '无 token');

    // 2. 取已发布商品（小程序自己的 products 接口）
    const list = await api.products({ pageSize: 50 });
    const items = list.items ?? [];
    check('顾客端商品列表取到已发布商品', items.length > 0, `${items.length} 件`);

    // 3. 选一件能解析出量体模板的商品
    let target = null;
    for (const item of items) {
      try {
        const tpl = await api.resolveTemplate(item.id);
        if (tpl && tpl.measurementSections && tpl.measurementSections.length) {
          target = { item, tpl };
          break;
        }
      } catch {
        // 换下一件
      }
    }
    check('商品可解析出量体模板', Boolean(target), target ? `${target.item.code ?? target.item.productCode ?? '-'} / ${target.tpl.name}` : '无可用模板');
    if (!target) {
      return finish();
    }

    // 3.1 模板必须真的带得出字段与必填项。
    //     这条断言来自一次真实缺陷：模板以原型 snake_case 入库时，
    //     接口返回 measurementFields=undefined，顾客端表单渲染为空、
    //     提交的量体资料也是空的。
    const tplFields = (target.tpl.measurementSections ?? []).flatMap((s) => s.measurementFields ?? []);
    const tplRequired = tplFields.filter((f) => f.required);
    check('量体模板带得出可填字段与必填项', tplFields.length > 0 && tplRequired.length > 0,
      `字段 ${tplFields.length} 个（必填 ${tplRequired.length} 个）`);

    // 4. 加载「定制申请表」页面（小程序自己的 Page）
    require(join(outDir, 'pages', 'apply', 'apply.js'));
    if (!pageOptions) {
      check('定制申请表页面注册成功', false, '未捕获到 Page() 调用');
      return finish();
    }
    const page = Object.assign({}, pageOptions);
    page.data = deepClone(pageOptions.data);
    page.setData = function setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        setPath(this.data, key, value);
      }
    };

    page.onLoad({ productId: target.item.id });
    await waitUntil(() => page.data.loading === false, 15000, '申请页加载');
    check('申请页加载出商品与量体字段', page.data.error === '' && page.data.sections.length > 0,
      page.data.error || `${page.data.sections.length} 个测量分区 / 必填 ${page.data.requiredTotal} 项`);

    // 5. 必填项留空 → 客户端校验必须报错，且不得发起提交
    let submitCalls = 0;
    const originalCreate = api.createCustomizationRequest;
    let capturedPayload = null;
    let createdDto = null;
    api.createCustomizationRequest = (payload) => {
      submitCalls += 1;
      capturedPayload = payload;
      const pending = originalCreate(payload);
      pending
        .then((dto) => {
          createdDto = dto;
        })
        .catch(() => undefined);
      return pending;
    };

    const emptyProblems = page.validate();
    check('必填项未填时客户端校验拦截', emptyProblems.length > 0, emptyProblems[0] ?? '');

    // 6. 填入合法值（取 min/max 中点，尊重 step）
    const sections = page.data.sections;
    let filled = 0;
    sections.forEach((section, si) => {
      section.fields.forEach((field, fi) => {
        if (!field.required) return;
        let value = field.min !== null && field.max !== null ? (field.min + field.max) / 2 : 100;
        if (field.step) {
          value = Math.round(value / field.step) * field.step;
        }
        if (field.min !== null && value < field.min) value = field.min;
        if (field.max !== null && value > field.max) value = field.max;
        page.setData({ [`sections[${si}].fields[${fi}].value`]: String(value) });
        filled += 1;
      });
    });
    page.setData({
      'contact.name': '验证顾客（虚构）',
      'contact.phone': '13800000000',
      'contact.region': '上海市 徐汇区',
      'contact.detail': '验证用虚构地址 1 号',
      remark: '自动化验证提交（虚构数据）'
    });

    const problems = page.validate();
    check('填写合法值后客户端校验通过', problems.length === 0, problems.join('；'));

    const beforeSubmit = submitCalls;
    page.submit();
    await waitUntil(() => capturedPayload !== null, 15000, '提交请求');
    await waitUntil(() => page.data.submitting === false, 15000, '提交完成');
    check('申请页提交触发真实请求', submitCalls === beforeSubmit + 1, `submitCalls=${submitCalls}`);

    // 7. 校验提交出去的 payload 形状（这是此前从未被执行过的代码路径）
    const payload = capturedPayload;
    check('payload 含 productId / measurements / contact / submitId',
      Boolean(payload && payload.productId && Array.isArray(payload.measurements) && payload.contact && payload.submitId),
      payload ? `measurements=${payload.measurements.length} 项` : '无 payload');
    check('payload 的量体字段数与必填项一致',
      payload && payload.measurements.length === page.data.requiredTotal,
      payload ? `${payload.measurements.length} vs 必填 ${page.data.requiredTotal}` : '');

    // 8. 服务端确实落库并返回申请
    await waitUntil(() => createdDto !== null, 15000, '申请创建回执');
    const created = createdDto ?? (await api.getCustomizationRequest(await findRequestId(api, payload)));
    check('服务端可查到该申请', Boolean(created && created.id), created ? `状态=${created.status}` : '未查到');
    check('申请初始状态为待审核', Boolean(created && created.status === 'PENDING_REVIEW'), created ? created.status : '');

    // 9. 幂等：同一 submitId 重复提交不产生第二条
    const idBefore = created ? created.id : '';
    const againDto = await originalCreate(payload);
    check('重复提交同一 submitId 幂等（返回同一条申请）',
      Boolean(againDto && idBefore && againDto.id === idBefore),
      `id=${idBefore}`);
    const listAfter = await api.listCustomizationRequests({ pageSize: 50 });
    const sameCount = (listAfter.items ?? []).filter((item) => item.id === idBefore).length;
    check('重复提交未产生第二条记录', sameCount === 1, `匹配 ${sameCount} 条`);

    // 10. 客户端与服务端校验一致性：越界值两端都要拦
    const outOfRange = findOutOfRangeTarget(page.data.sections);
    let clientRejected = false;
    if (outOfRange) {
      const { si, fi } = outOfRange;
      page.setData({ [`sections[${si}].fields[${fi}].value`]: String(outOfRange.value) });
      clientRejected = page.validate().length > 0;
      // 客户端放行时，服务端也必须拒绝
      const badPayload = {
        ...payload,
        submitId: payload.submitId + '-out-of-range',
        measurements: payload.measurements.map((m) =>
          m.fieldCode === outOfRange.code ? { ...m, value: outOfRange.value } : m
        )
      };
      let serverCode = '';
      try {
        await originalCreate(badPayload);
      } catch (error) {
        serverCode = String(error.code ?? error.message ?? '');
      }
      check('越界值：客户端拦截', clientRejected, outOfRange.code);
      check('越界值：服务端同样拒绝', serverCode === 'MEASUREMENT_INVALID', serverCode || '服务端未拒绝');
    } else {
      check('越界值：客户端拦截', false, '未找到可越界字段');
      check('越界值：服务端同样拒绝', false, '未找到可越界字段');
    }

    // 11. 联系方式缺失 → 客户端拦截且不发起请求
    const callsBefore = submitCalls;
    const savedPhone = page.data.contact.phone;
    page.setData({ 'contact.phone': '' });
    const contactProblems = page.validate();
    page.submit();
    await sleep(200);
    check('联系方式缺失被客户端拦截', contactProblems.length > 0, contactProblems.find((p) => p.includes('电话')) ?? '');
    check('校验不通过时不发起提交', submitCalls === callsBefore, `submitCalls=${submitCalls}`);
    page.setData({ 'contact.phone': savedPhone });

    // 12. 提交成功后页面跳转到申请详情（页面里有 800ms 延迟，需等待）
    await sleep(1200);
    check('提交成功后跳转申请详情页',
      navigations.some((n) => n.type === 'redirectTo' && n.url.includes('request-detail')),
      navigations.map((n) => n.url).join(' | '));

    // 13. 顾客可见自己的申请列表
    const myRequests = await api.listCustomizationRequests({ pageSize: 20 });
    check('顾客可查到自己的定制申请列表', (myRequests.items ?? []).length > 0, `${(myRequests.items ?? []).length} 条`);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }

  return finish();
}

/** 通过顾客自己的列表找到刚提交的申请（按状态与商品过滤） */
async function findRequestId(api, payload) {
  const list = await api.listCustomizationRequests({ pageSize: 50 });
  const items = list.items ?? [];
  const match = items.find((item) => item.productId === payload.productId);
  return match ? match.id : '';
}

async function findRequestBySubmitId(api, requestId) {
  if (!requestId) return '';
  const list = await api.listCustomizationRequests({ pageSize: 50 });
  const items = list.items ?? [];
  const match = items.find((item) => item.id === requestId);
  return match ? match.id : '';
}

/** 找一个可以越界的字段（低于 min） */
function findOutOfRangeTarget(sections) {
  for (let si = 0; si < sections.length; si += 1) {
    for (let fi = 0; fi < sections[si].fields.length; fi += 1) {
      const field = sections[si].fields[fi];
      if (field.min !== null && field.min !== undefined) {
        return { si, fi, code: field.code, value: field.min - 1 };
      }
    }
  }
  return null;
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
