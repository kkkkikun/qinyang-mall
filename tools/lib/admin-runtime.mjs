/**
 * 管理后台页面级执行验证的共享运行时。
 *
 * 小程序侧的教训很直接 —— 「接口 200、类型全绿、验收全绿」并不能证明页面可用，
 * 必须真的把页面跑起来。管理后台此前同样只被 `vue-tsc` 与 lint 检查过，
 * 9 个页面从未在运行时执行过。
 *
 * 这里提供的是「把后台页面当成一个可执行对象」的最小装置：
 *   1. 用 tsc 把 `apps/admin-web/src`（连带 `packages/contracts/src`）编译成 CommonJS
 *      （`apps/admin-web/tsconfig.harness.json` → `.harness-tmp/`），
 *      这样 api 层、工具函数、pinia store 都能被 Node 直接 require；
 *   2. 用 `@vue/compiler-sfc` 解析每个 `.vue`，取出 `<script setup>` 编译产物
 *      （仍是 TS+ESM），再用 TypeScript 的 `transpileModule` 去类型转成 CommonJS；
 *   3. 统一用模块加载钩子（Module._load）替换 `vue` / `vue-router` /
 *      `tdesign-vue-next` / `@qinyang/contracts` / `*.vue`，
 *      再**真正调用 setup()**；
 *   4. `onMounted` 等生命周期由沙箱记录后手动触发（无 DOM 环境），
 *      于是页面自己的数据加载逻辑会真的去请求真实 API。
 *
 * 说明：
 * - TDesign 组件与 vue-router 在沙箱里是**桩件**（页面模板不渲染，
 *   这里验证的是页面的数据逻辑而不是渲染结果）；
 * - 断言的是页面**真实暴露的绑定**（`can` 是函数、`stats` 字段名以源码为准），
 *   不允许为了通过而放宽。
 */

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, relative, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ADMIN = join(REPO, 'apps', 'admin-web');
export const OUT = join(ADMIN, '.harness-tmp');
export const VIEWS = join(ADMIN, 'src', 'views');

export const API_BASE = (
  process.env.QY_API_BASE ?? process.argv[2] ?? 'http://127.0.0.1:18110/api/v1'
).replace(/\/$/, '');

/** 编译 admin-web 的 TS 到 CommonJS */
export function compileAdminWeb() {
  const tsc = [
    join(ADMIN, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(REPO, 'node_modules', 'typescript', 'bin', 'tsc')
  ].find((candidate) => existsSync(candidate));
  if (!tsc) {
    throw new Error(
      '未找到 typescript 编译器：本脚本需要已安装依赖的环境（服务器）执行。\n' +
        '请在服务器上运行：node tools/verify_admin_pages.mjs'
    );
  }
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  // 该目录会被 Node 当作 CommonJS 包（admin-web 自身是 ESM）
  writeFileSync(join(OUT, 'package.json'), '{"type":"commonjs"}\n', 'utf-8');
  try {
    execFileSync(
      process.execPath,
      [tsc, '-p', join(ADMIN, 'tsconfig.harness.json')],
      { cwd: ADMIN, encoding: 'utf-8', stdio: 'pipe' }
    );
  } catch (error) {
    const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    // 类型错误不阻断（页面执行验证关心运行时行为），但必须打印出来
    if (detail) {
      console.log('⚠️  编译告警（不影响执行）：');
      console.log(
        detail
          .split('\n')
          .slice(0, 12)
          .map((line) => '    ' + line)
          .join('\n')
      );
    }
  }
  return OUT;
}

/** 沙箱：模块加载钩子 + 桩件 */
export function createSandbox() {
  const requireFromOut = createRequire(join(OUT, 'noop.js'));
  const Module = requireFromOut('node:module');
  const realVue = requireFromOut('vue');
  const ts = requireFromOut('typescript');
  const { createPinia, setActivePinia } = requireFromOut('pinia');

  // localStorage（http.ts / stores/auth.ts 都用）
  const store = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: (key) => store.delete(key),
      clear: () => store.clear()
    },
    configurable: true,
    writable: true
  });

  // API 基址透口（http.ts 读取）
  globalThis.__QY_API_BASE__ = API_BASE;

  setActivePinia(createPinia());

  const messages = [];
  const navigations = [];
  let mountedHooks = [];

  // vue：真实响应式 + 生命周期记录（无 DOM 环境无法真正 mount）
  const vueStub = {
    ...realVue,
    onMounted: (fn) => mountedHooks.push(fn),
    onUnmounted: () => undefined,
    onBeforeUnmount: () => undefined,
    onActivated: () => undefined,
    onDeactivated: () => undefined,
    onBeforeMount: () => undefined,
    onUpdated: () => undefined
  };

  const routeStub = {
    path: '/dashboard',
    fullPath: '/dashboard',
    name: undefined,
    query: {},
    params: {},
    meta: {}
  };
  const routerStub = {
    currentRoute: realVue.ref(routeStub),
    push: async (to) => {
      navigations.push({ type: 'push', to });
    },
    replace: async (to) => {
      navigations.push({ type: 'replace', to });
    },
    back: () => navigations.push({ type: 'back' }),
    go: () => undefined,
    resolve: (to) => ({ path: typeof to === 'string' ? to : to.path })
  };
  const routerModule = { useRouter: () => routerStub, useRoute: () => routeStub };

  const MessagePlugin = {
    success: (message) => messages.push({ type: 'success', message }),
    error: (message) => messages.push({ type: 'error', message }),
    warning: (message) => messages.push({ type: 'warning', message }),
    info: (message) => messages.push({ type: 'info', message }),
    loading: (message) => messages.push({ type: 'loading', message }),
    closeAll: () => messages.push({ type: 'closeAll', message: '' })
  };
  const Dummy = { name: 'Dummy', render: () => null };
  const tdesignStub = new Proxy(
    { MessagePlugin },
    {
      get(target, key) {
        if (key in target) return target[key];
        return Dummy;
      }
    }
  );

  // 契约包：优先用 harness 编译出来的版本（与被编译的源码同源）
  let contractsModule = {};
  for (const candidate of [
    join(OUT, 'packages', 'contracts', 'src', 'index.js'),
    '@qinyang/contracts'
  ]) {
    try {
      contractsModule = requireFromOut(candidate);
      break;
    } catch {
      /* 继续尝试下一个 */
    }
  }

  // 统一拦截：编译产物里的 require() 也走同一套桩件
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vue') return vueStub;
    if (request === 'vue-router') return routerModule;
    if (request === 'tdesign-vue-next') return tdesignStub;
    if (request === '@qinyang/contracts') return contractsModule;
    if (request.endsWith('.vue')) return { default: Dummy };
    return originalLoad.apply(this, arguments);
  };

  /** 源码相对路径 → harness 编译产物路径 */
  function compiledOf(absSource) {
    const rel = relative(REPO, absSource).replace(/\\/g, '/');
    return join(OUT, rel.replace(/\.ts$/, ''));
  }

  /** SFC 顶层 import 的解析（相对路径按源码目录解析后映射到编译产物） */
  function req(specifier, fromFile) {
    if (specifier.startsWith('.')) {
      const abs = resolvePath(dirname(fromFile), specifier);
      const base = compiledOf(abs);
      for (const candidate of [`${base}.js`, join(base, 'index.js')]) {
        if (existsSync(candidate)) {
          return requireFromOut(candidate);
        }
      }
      return {};
    }
    return Module._load(specifier, null, false);
  }

  return {
    messages,
    navigations,
    routeStub,
    routerStub,
    ts,
    req,
    requireFromOut,
    resetHooks() {
      mountedHooks = [];
    },
    runHooks() {
      const hooks = mountedHooks;
      mountedHooks = [];
      return hooks.map((hook) => hook());
    },
    lastMessage(type) {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].type === type) return messages[i].message;
      }
      return undefined;
    },
    clearMessages() {
      messages.length = 0;
    },
    restore() {
      Module._load = originalLoad;
    }
  };
}

/** 把 SFC 的编译产物（TS+ESM）转成 CommonJS，去掉类型语法 */
function transpile(sandbox, code, fileName) {
  const { ts } = sandbox;
  return ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      useDefineForClassFields: true,
      isolatedModules: true,
      jsx: ts.JsxEmit.Preserve
    },
    fileName
  }).outputText;
}

export function loadView(sandbox, viewName) {
  const { parse, compileScript } = sandbox.requireFromOut('@vue/compiler-sfc');
  const file = join(VIEWS, `${viewName}.vue`);
  const source = readFileSync(file, 'utf-8');
  const { descriptor } = parse(source, { filename: `${viewName}.vue` });
  const compiled = compileScript(descriptor, { id: `harness-${viewName}` });

  const code = transpile(sandbox, compiled.content, `${viewName}.ts`);

  sandbox.resetHooks();
  const module = { exports: {} };
  const factory = new Function('require', 'module', 'exports', '__file', code + '\n');
  factory((specifier) => sandbox.req(specifier, file), module, module.exports, file);

  const options = module.exports.default ?? module.exports;
  if (!options || typeof options.setup !== 'function') {
    throw new Error(`页面 ${viewName} 未能解析出 setup()`);
  }
  return { options, file };
}

/** 执行页面：跑 setup + 触发 onMounted，返回页面暴露的绑定 */
export async function runView(sandbox, viewName, { query } = {}) {
  const { options } = loadView(sandbox, viewName);
  if (query) Object.assign(sandbox.routeStub.query, query);
  const raw = await options.setup({}, { expose: () => undefined });
  const hooks = sandbox.runHooks();
  // onMounted 里通常是 async 的 load()，这里等它们真正跑完
  const settled = await Promise.allSettled(hooks);
  settled.forEach((item, index) => {
    if (item.status === 'rejected') {
      console.log(
        `⚠️  ${viewName} 的 onMounted #${index + 1} 抛错：${item.reason?.message ?? item.reason}`
      );
    }
  });
  // setup 返回的是原始 ref / computed，模板里由 Vue 实例代理自动解包；
  // 这里用同样的规则包一层，断言时就能直接读到值。
  const { isRef } = sandbox.requireFromOut('vue');
  return new Proxy(raw, {
    get(target, key) {
      const value = target[key];
      return isRef(value) ? value.value : value;
    },
    set(target, key, value) {
      const current = target[key];
      if (isRef(current)) current.value = value;
      else target[key] = value;
      return true;
    }
  });
}

/** 清理 harness 编译产物（.harness-tmp/） */
export function cleanupHarness() {
  rmSync(OUT, { recursive: true, force: true });
}

/** 简易断言收集器 */
export function createChecker() {
  const results = [];
  let failed = 0;
  return {
    results,
    check(name, ok, detail = '') {
      results.push({ name, ok, detail });
      if (!ok) failed += 1;
      console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
    },
    finish() {
      console.log(`\n=== 结果：${results.length - failed}/${results.length} 项通过 ===`);
      if (failed) {
        console.log('失败项：');
        results
          .filter((r) => !r.ok)
          .forEach((r) => console.log(`  - ${r.name}${r.detail ? '：' + r.detail : ''}`));
      }
      return failed ? 1 : 0;
    }
  };
}
