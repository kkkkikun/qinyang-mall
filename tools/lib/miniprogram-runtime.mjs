/**
 * 小程序执行运行时（共享库）。
 *
 * 让「小程序自己的代码」能在 Node 里跑起来，用于对真实 API 做端到端验证：
 *
 * 1. 用工作区的 `tsc` 把 `apps/miniprogram` 编译到临时目录
 *    —— 不跳过类型检查，因此顺带把「小程序类型检查」变成一道真实关卡；
 * 2. 注入 `wx` / `Page` / `App` / `getApp` 等小程序全局的桩件，
 *    其中 `wx.request` 用 fetch 打到真实运行中的 API；
 * 3. 提供一个最小的 Page 运行时：`setData` 支持 `a.b` 与 `a[0].b` 路径。
 *
 * 纯 stdlib，无第三方依赖；需要已安装依赖的环境（服务器）。
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitUntil(predicate, timeoutMs = 15000, label = '条件') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(25);
  }
  throw new Error(`等待超时：${label}`);
}

export function deepClone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

/** 支持 'a.b' 与 'a[0].b' 形式的 setData 路径 */
export function setPath(target, path, value) {
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

/** 定位工作区里的 tsc（根 devDependency 或 api 工作区） */
export function locateTsc() {
  const candidates = [
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(REPO, 'apps', 'api', 'node_modules', 'typescript', 'bin', 'tsc')
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/** 编译小程序到临时目录，返回 outDir（调用方负责清理） */
export function compileMiniprogram() {
  const tsc = locateTsc();
  if (!tsc) {
    throw new Error(
      '未找到 typescript 编译器：本脚本需要已安装依赖的环境（服务器）执行。\n' +
        '请在服务器上运行：node tools/verify_miniprogram_pages.mjs'
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
    rmSync(outDir, { recursive: true, force: true });
    throw new Error(`小程序类型检查未通过，无法执行验证：\n${detail}`);
  }
  return outDir;
}

/**
 * 安装小程序全局桩件。
 *
 * @param {string} baseUrl 真实 API 基址
 */
export function createRuntime(baseUrl) {
  const storage = new Map();
  const toasts = [];
  const navigations = [];
  const modals = [];
  const requestLog = [];
  let pageOptions = null;
  let modalAnswer = true;

  async function wxRequest(options) {
    const { url, method = 'GET', data, header = {}, success, fail } = options;
    requestLog.push({ method, url });
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
    showModal: (options) => {
      modals.push(options);
      const res = { confirm: modalAnswer, cancel: !modalAnswer };
      options.success && options.success(res);
    },
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
      setTimeout(() => options.success && options.success({ code: runtime.mockCode }), 0);
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

  globalThis.Page = (options) => {
    pageOptions = options;
  };
  globalThis.App = () => undefined;
  globalThis.getApp = () => ({ globalData: {} });
  globalThis.getCurrentPages = () => [];

  const runtime = {
    mockCode: 'dev:openid-mp-verify-001',
    storage,
    toasts,
    navigations,
    modals,
    requestLog,
    baseUrl,
    /** 后续 wx.showModal 的回答（默认确认） */
    setModalAnswer(answer) {
      modalAnswer = answer;
    },
    resetPageCapture() {
      pageOptions = null;
    },
    lastPageOptions() {
      return pageOptions;
    },
    /**
     * 加载编译后的页面模块并返回 Page 选项。
     *
     * 注意：Node 会缓存模块，第二次 require 同一文件不会重新执行，
     * `Page()` 也就不会被再次调用 —— 因此这里必须缓存首次捕获的选项，
     * 否则「同一页面打开两次」的场景会拿到 null。
     */
    loadPage(outDir, name) {
      if (!runtime.pageCache) runtime.pageCache = new Map();
      if (runtime.pageCache.has(name)) {
        return runtime.pageCache.get(name);
      }
      runtime.resetPageCapture();
      const require = createRequire(join(outDir, 'noop.js'));
      require(join(outDir, 'pages', name, `${name}.js`));
      const options = runtime.lastPageOptions();
      runtime.pageCache.set(name, options);
      return options;
    },
    /** 加载编译后的模块（utils 等） */
    loadModule(outDir, relative) {
      const require = createRequire(join(outDir, 'noop.js'));
      return require(join(outDir, relative));
    },
    /** 实例化一个页面 */
    createPage(options) {
      const page = Object.assign({}, options);
      page.data = deepClone(options.data);
      page.setData = function setData(patch) {
        for (const [key, value] of Object.entries(patch)) {
          setPath(this.data, key, value);
        }
      };
      return page;
    },
    /** 等待页面结束加载（loading 不再为 true、或出现 error、或额外数据键已就绪） */
    async settle(page, extra = {}) {
      const extraKeys = Object.keys(extra);
      // 数组要用 length 判断：Boolean([]) 为真，会导致空数组被误判为「已就绪」
      const ready = (value) =>
        Array.isArray(value) ? value.length > 0 : Boolean(value);
      await waitUntil(
        () =>
          page.data.loading !== true ||
          Boolean(page.data.error) ||
          extraKeys.every((key) => ready(page.data[key])),
        15000,
        '页面加载'
      );
    }
  };

  // 让桩件闭包能引用 runtime（wx.login 需要 mockCode）
  runtime.mockCode = 'dev:openid-mp-verify-001';
  return runtime;
}
