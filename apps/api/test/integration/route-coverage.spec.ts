import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../../src/app.module';
import { configureBodyParsers } from '../../src/common/http/body-parser';

/**
 * 路由覆盖守卫（Route Coverage Guard）。
 *
 * 本轮修复的最严重缺陷，正是「控制器写好了但从没注册进模块」——
 * `QuotesAdminController` 定义在 `customization-admin.controller.ts` 里，
 * 却没有出现在任何模块的 `controllers` 数组中，于是
 * `POST /admin/quotes/:id/withdraw` 线上永远 404，
 * 后台「撤回报价」按钮是个纯装饰。
 *
 * 这类缺陷不会被「接口 200 + 类型全绿 + 既有测试全绿」发现，
 * 因为根本没写测试去打它。所以这里加两道守卫：
 *
 * 1. 契约 → 运行时：`docs/api/REST-CONTRACT.md` 里列的每个接口，
 *    都必须真的在 Nest 里注册了路由（契约写了但没实现 = 死路）。
 * 2. 运行时 → 契约：除白名单外，代码里多出来的路由也必须登记进契约
 *    （实现了但没写进契约 = 文档漂移）。
 * 3. 孤儿控制器：源码里 `export class *Controller` 的类，
 *    必须出现在某个模块的 `controllers` 数组里。
 */
describe('路由覆盖守卫', () => {
  let app: INestApplication;
  let registered: Set<string>;
  /** 按注册顺序排列的路由（Express 栈顺序 = 注册顺序） */
  let routeOrder: string[] = [];

  const API_ROOT = path.resolve(__dirname, '../../../..');
  const CONTRACT_PATH = path.join(API_ROOT, 'docs/api/REST-CONTRACT.md');
  const SRC_ROOT = path.join(API_ROOT, 'apps/api/src');

  /** 契约里没有、但确实存在也合理的内部接口 */
  const EXTRA_ROUTE_ALLOWLIST = new Set<string>(['GET /api/v1/health']);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    // 与生产环境共用同一份请求体上限（JSON 4MB），避免测试通过、线上 413

    configureBodyParsers(app);

    await app.init();

    const server = app.getHttpAdapter().getInstance();
    const stack = server._router?.stack ?? server.router?.stack ?? [];
    registered = new Set<string>();
    routeOrder = [];
    for (const layer of stack) {
      if (!layer?.route) continue;
      const methods = Object.keys(layer.route.methods ?? {}).filter(
        (m) => layer.route.methods[m] !== false,
      );
      for (const method of methods) {
        const key = `${method.toUpperCase()} ${layer.route.path}`;
        registered.add(key);
        routeOrder.push(key);
      }
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  /** 从契约文档里解析出 METHOD /path 清单 */
  function parseContractRoutes(): Set<string> {
    const raw = fs.readFileSync(CONTRACT_PATH, 'utf8');
    const routes = new Set<string>();
    const row = /^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`\s*\|/gm;
    let m: RegExpExecArray | null;
    while ((m = row.exec(raw)) !== null) {
      const method = m[1].toUpperCase();
      // 去掉 query 部分与结尾斜杠，避免 `?productId=` 这类写法造成误判
      const p = m[2].split('?')[0].trim().replace(/\/+$/, '');
      routes.add(`${method} /api/v1${p}`);
    }
    return routes;
  }

  it('契约文档里列出的每个接口都真的注册了路由', () => {
    const contract = parseContractRoutes();
    expect(contract.size).toBeGreaterThan(40);

    const missing = [...contract].filter((r) => !registered.has(r)).sort();
    if (missing.length > 0) {
      throw new Error(`契约里声明但代码未注册（调用即 404）：\n${missing.join('\n')}`);
    }
    expect(missing).toEqual([]);
  });

  it('代码里注册的路由都在契约文档中登记（防止文档漂移）', () => {
    const contract = parseContractRoutes();
    const undocumented = [...registered]
      .filter((r) => !contract.has(r) && !EXTRA_ROUTE_ALLOWLIST.has(r))
      .sort();
    if (undocumented.length > 0) {
      throw new Error(`代码已实现但契约未登记：\n${undocumented.join('\n')}`);
    }
    expect(undocumented).toEqual([]);
  });

  it('字面量路由不会被更早注册的参数路由遮蔽', () => {
    // Express 按注册顺序匹配：若 `/x/:id` 先于 `/x/export` 注册，
    // 请求 /x/export 会命中 :id —— 这正是「导出接口 404」那类缺陷的成因。
    const shadows: string[] = [];
    for (let i = 0; i < routeOrder.length; i += 1) {
      const later = routeOrder[i];
      const laterParts = later.split(' ')[1].split('/').filter(Boolean);
      for (let j = 0; j < i; j += 1) {
        const earlier = routeOrder[j];
        const earlierMethod = earlier.split(' ')[0];
        const laterMethod = later.split(' ')[0];
        if (earlierMethod !== laterMethod) continue;
        const earlierParts = earlier.split(' ')[1].split('/').filter(Boolean);
        if (earlierParts.length !== laterParts.length) continue;
        let shadowed = false;
        for (let k = 0; k < earlierParts.length; k += 1) {
          if (earlierParts[k].startsWith(':')) {
            // 参数段会吃掉字面量段
            if (!laterParts[k].startsWith(':')) {
              shadowed = true;
              break;
            }
          } else if (earlierParts[k] !== laterParts[k]) {
            shadowed = false;
            break;
          }
        }
        if (shadowed) {
          shadows.push(`${later} 会被先注册的 ${earlier} 截走`);
        }
      }
    }
    if (shadows.length > 0) {
      throw new Error(`存在被遮蔽的路由：\n${shadows.join('\n')}`);
    }
    expect(shadows).toEqual([]);
  });

  it('不存在「定义了却没注册进模块」的孤儿控制器', () => {    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts')) files.push(full);
      }
    };
    walk(SRC_ROOT);

    // 1. 收集所有 export class *Controller
    const declared = new Map<string, string>(); // 类名 → 文件
    const controllerRe = /export\s+class\s+([A-Za-z0-9_]*Controller)\b/g;
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = controllerRe.exec(src)) !== null) {
        declared.set(m[1], path.relative(API_ROOT, file));
      }
    }
    expect(declared.size).toBeGreaterThan(0);

    // 2. 收集所有模块 controllers 数组里登记的类
    const registeredClasses = new Set<string>();
    const arrayRe = /controllers\s*:\s*\[([^\]]*)\]/g;
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = arrayRe.exec(src)) !== null) {
        for (const name of m[1].split(',').map((s) => s.trim()).filter(Boolean)) {
          registeredClasses.add(name);
        }
      }
    }

    const orphans = [...declared.entries()]
      .filter(([name]) => !registeredClasses.has(name))
      .map(([name, file]) => `${name}（${file}）`)
      .sort();
    if (orphans.length > 0) {
      throw new Error(
        `这些控制器从未注册进任何模块，其路由永远不会被注册：\n${orphans.join('\n')}`,
      );
    }
    expect(orphans).toEqual([]);
  });

  /**
   * 所有 `@Body()` 的运行时类型必须是 **class DTO**。
   *
   * 背景：顾客「确认报价 / 拒绝报价」此前直接用 contracts 里的 **interface**：
   * interface 在运行时是 `Object`，Nest 的 ValidationPipe 对它**整体跳过校验**，
   * `whitelist / forbidNonWhitelisted` 对它完全无效 ——
   * 于是传 `{}` 也不报错，quoteId 是 undefined，版本冲突被报成 409 而不是 400。
   *
   * 这条守卫把「接口型请求体」在编译期之外再兜一层底，
   * 避免同类问题在别的接口上复发。
   */
  it('所有 @Body() 的参数类型都是 class DTO（interface 会被整体跳过校验）', () => {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.controller.ts')) files.push(full);
      }
    };
    walk(SRC_ROOT);

    const offenders: string[] = [];
    // 抓的是**类型**（冒号之后），不是参数名
    const bodyRe = /@Body\([^)]*\)\s*(?:public\s+|private\s+|protected\s+|readonly\s+)*[A-Za-z0-9_]+\s*[!?]?\s*:\s*([A-Za-z0-9_]+)/g;
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = bodyRe.exec(src)) !== null) {
        const type = m[1];
        if (!type.endsWith('Dto')) {
          offenders.push(`${path.relative(API_ROOT, file)}: @Body() ${type}`);
        }
      }
    }
    if (offenders.length > 0) {
      throw new Error(
        `这些 @Body() 的类型不是 class DTO，运行时会被 ValidationPipe 整体跳过校验：\n${offenders.join('\n')}`,
      );
    }
    expect(offenders).toEqual([]);
  });
});
