#!/usr/bin/env node
/**
 * 静态站点 + API 反代（零依赖）。
 *
 * 用途：把某个版本的构建产物单独跑起来，用于「优化前后」截图对照 ——
 * 不必为了一个旧版本重建整套 Docker 镜像。
 *
 * 用法：
 *   node tools/serve_dist.mjs <dist目录> <端口> [apiTarget]
 * 例：
 *   node tools/serve_dist.mjs apps/admin-web/dist 18112 http://127.0.0.1:18110
 */

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const [distDir, portArg, apiTarget = 'http://127.0.0.1:18110'] = process.argv.slice(2);
if (!distDir || !portArg) {
  console.error('用法：node tools/serve_dist.mjs <dist目录> <端口> [apiTarget]');
  process.exit(1);
}
const port = Number(portArg);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  // API 反代
  if (url.pathname.startsWith('/api')) {
    const target = `${apiTarget}${url.pathname}${url.search}`;
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const upstream = await fetch(target, {
          method: req.method,
          headers: {
            'Content-Type': req.headers['content-type'] ?? 'application/json',
            // 必须透传管理员令牌，否则后台一律 401
            ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
            ...(req.headers['x-customer-token']
              ? { 'x-customer-token': req.headers['x-customer-token'] }
              : {}),
          },
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
        });
        const body = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
        });
        res.end(body);
      } catch (error) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: -1, message: String(error) }));
      }
    });
    return;
  }

  // 静态资源
  const safe = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  let file = join(distDir, safe);
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(distDir, 'index.html');
  }
  if (!existsSync(file)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`静态服务已启动：http://127.0.0.1:${port}（目录 ${distDir}，API → ${apiTarget}）`);
});
