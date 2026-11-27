#!/usr/bin/env node
/**
 * 管理后台页面截图（Chromium DevTools Protocol，无需 playwright 包）。
 *
 * 背景：报告要求给出关键页面的「前后截图」。
 * 后台是浏览器页面，可以直接用无头 Chromium 渲染；
 * 小程序是微信原生页面，没有浏览器渲染器，只能靠开发者工具或真机（见报告的阻塞项）。
 *
 * 依赖：服务器上存在 chromium（~/.cache/ms-playwright 下的 chromium-* 目录）。
 * Node 22+ 自带全局 WebSocket，因此不需要额外 npm 包。
 *
 * 用法（服务器）：
 *   node tools/screenshot_admin.mjs <adminBaseUrl> <apiBaseUrl> <输出目录> [标签]
 * 例：
 *   node tools/screenshot_admin.mjs http://127.0.0.1:18111 http://127.0.0.1:18110/api/v1 \
 *     docs/screenshots/after after
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 找到服务器上的 chromium */
function findChrome() {
  const base = join(homedir(), '.cache/ms-playwright');
  if (!existsSync(base)) return null;
  for (const dir of readdirSync(base)) {
    if (!dir.startsWith('chromium-')) continue;
    for (const candidate of [
      join(base, dir, 'chrome-linux64', 'chrome'),
      join(base, dir, 'chrome-linux', 'chrome'),
    ]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const [adminBase, apiBase, outDir, label = 'shot'] = process.argv.slice(2);
if (!adminBase || !apiBase || !outDir) {
  console.error('用法：node tools/screenshot_admin.mjs <adminBaseUrl> <apiBaseUrl> <输出目录> [标签]');
  process.exit(1);
}

const chromePath = findChrome();
if (!chromePath) {
  console.error('❌ 未找到 chromium（~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome）');
  process.exit(2);
}

const PORT = 9222 + Math.floor(Math.random() * 500);
const VIEWPORT = { width: 1440, height: 900 };

/** 后台 9 个页面（路由 → 文件名） */
const PAGES = [
  ['/login', 'login'],
  ['/dashboard', 'dashboard'],
  ['/products', 'products'],
  ['/categories', 'categories'],
  ['/banners', 'banners'],
  ['/templates', 'templates'],
  ['/requests', 'requests'],
  ['/orders', 'orders'],
  ['/audit-logs', 'audit-logs'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 极简 CDP 客户端 */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时：${method}`));
        }
      }, 30000);
    });
  }
}

async function main() {
  mkdirSync(outDir, { recursive: true });

  // 1. 取管理员令牌
  const user = process.env.SEED_OWNER_USERNAME ?? 'owner';
  const pass = process.env.SEED_ADMIN_PASSWORD ?? 'Qinyang@2026';
  const loginRes = await fetch(`${apiBase}/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user, password: pass }),
  });
  const loginBody = await loginRes.json();
  const token = loginBody?.data?.token;
  const adminUser = loginBody?.data?.user ?? null;
  if (!token) {
    console.error('❌ 管理员登录失败，无法截图');
    process.exit(3);
  }

  // 2. 启动无头 Chromium
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    'about:blank',
  ], { stdio: 'ignore' });

  const cleanup = () => {
    try {
      chrome.kill('SIGKILL');
    } catch {
      /* 忽略 */
    }
  };
  process.on('exit', cleanup);

  // 3. 等待调试端口就绪
  let target = null;
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' });
      target = await res.json();
      break;
    } catch {
      await sleep(500);
    }
  }
  if (!target) {
    console.error('❌ 无头浏览器未就绪');
    cleanup();
    process.exit(4);
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  const cdp = new Cdp(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const shots = [];

  for (const [route, name] of PAGES) {
    const url = `${adminBase}${route}`;
    await cdp.send('Page.navigate', { url });
    await sleep(1200);

    // 登录态：token 与用户信息写入 localStorage 后重载
    if (route !== '/login') {
      // token 与用户信息都要写入：顶栏显示的是 qy_admin_user
      await cdp.send('Runtime.evaluate', {
        expression:
          `localStorage.setItem('qy_admin_token', ${JSON.stringify(token)});` +
          `localStorage.setItem('qy_admin_user', ${JSON.stringify(JSON.stringify(adminUser))});`,
      });
      await cdp.send('Page.navigate', { url });
      await sleep(1800);
    }

    const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const file = join(outDir, `${label}-${name}.png`);
    writeFileSync(file, Buffer.from(result.data, 'base64'));
    shots.push(file);
    console.log(`📸 ${file}`);
  }

  // 额外一张：商品页的「批量导入」抽屉（第六轮新增能力）。
  // 抽屉是浮层，不截这一张就看不到导入面板长什么样。
  {
    await cdp.send('Page.navigate', { url: `${adminBase}/products` });
    await sleep(1800);
    const clicked = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const btn = [...document.querySelectorAll('button')]
          .find((b) => (b.textContent || '').trim() === '批量导入');
        if (!btn) return 'not-found';
        btn.click();
        return 'clicked';
      })()`,
    });
    await sleep(1200);
    if (clicked?.result?.value === 'clicked') {
      const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const file = join(outDir, `${label}-product-import.png`);
      writeFileSync(file, Buffer.from(result.data, 'base64'));
      shots.push(file);
      console.log(`📸 ${file}`);
    } else {
      console.log('⚠️  未找到「批量导入」按钮，跳过抽屉截图');
    }
  }

  cleanup();
  console.log(`\n共 ${shots.length} 张截图 → ${outDir}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ 截图失败：', error?.message ?? error);
    process.exit(1);
  });
