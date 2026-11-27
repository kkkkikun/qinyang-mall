import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AdminRole } from '@qinyang/contracts';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureBodyParsers } from '../../src/common/http/body-parser';
import { AdminUser } from '../../src/database/entities/admin-user.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

/**
 * 轮播排序接口 `PUT /admin/banners/reorder`。
 *
 * 为什么要有这个独立接口：
 * 后台原来的「上移 / 下移」是**逐条** `PUT /admin/banners/:id` 改 `sortOrder`，
 * 而那个接口是整行保存 —— 商家 A 刚改了标题，商家 B 接着点「下移」，
 * B 手里那份**旧快照**会把 A 的标题改回去；调用方拿到 200，毫无提示。
 * 逐条更新中途失败还会留下「一半新顺序、一半旧顺序」的半成品。
 *
 * 这里是覆盖的行为契约：
 * 1. 排序**只改 sortOrder**，不动标题/图片/投放期（不整行回写）；
 * 2. 排序结果是**连续**的 0..n-1（不会出现「点了没反应」的重复值）；
 * 3. 不在给定顺序里的轮播（期间新增的）**不会被丢弃**，追加到末尾；
 * 4. 参数非法（空、重复、不存在）→ 400 / 404，不产生半成品。
 */
describe('轮播排序（PUT /admin/banners/reorder）', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let token: string;

  const http = () => request(app.getHttpServer());
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        validationError: { target: false },
      }),
    );
    configureBodyParsers(app);
    await app.init();

    const dataSource = moduleRef.get(DataSource);
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of [
      'order_events',
      'orders',
      'quotes',
      'customization_requests',
      'payment_records',
      'audit_logs',
      'product_media',
      'products',
      'banners',
      'measurement_templates',
      'guide_pages',
      'categories',
      'customers',
      'admin_users',
    ]) {
      await dataSource.query(`TRUNCATE TABLE \`${table}\``);
    }
    await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');

    adminRepo = moduleRef.get<Repository<AdminUser>>(getRepositoryToken(AdminUser));
    const hash = await bcrypt.hash('Test@12345', 4);
    await adminRepo.save(
      adminRepo.create({
        username: 'it-reorder-owner',
        displayName: '排序店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
    );

    const login = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-reorder-owner', password: 'Test@12345' })
      .expect(200);
    token = login.body.data.token;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  interface BannerRow {
    id: string;
    title: string;
    imageUrl: string;
    sortOrder: number;
    status: string;
    version: number;
  }

  async function listBanners(): Promise<BannerRow[]> {
    const res = await http().get('/api/v1/admin/banners').set(auth(token)).expect(200);
    return res.body.data as BannerRow[];
  }

  async function createBanner(title: string): Promise<BannerRow> {
    const res = await http()
      .post('/api/v1/admin/banners')
      .set(auth(token))
      .send({
        title,
        imageUrl: `https://example.com/${encodeURIComponent(title)}.jpg`,
        linkType: 'NONE',
        linkValue: null,
        sortOrder: 0,
        status: 'ACTIVE',
      })
      .expect(201);
    return res.body.data as BannerRow;
  }

  it('按给定顺序重排，且只改 sortOrder（不覆盖文案与图片）', async () => {
    const a = await createBanner('排序 A');
    const b = await createBanner('排序 B');
    const c = await createBanner('排序 C');

    // 先把标题改掉并制造重复的 sortOrder（历史数据里存在的情况）
    await http()
      .put(`/api/v1/admin/banners/${a.id}`)
      .set(auth(token))
      .send({
        title: '排序 A（已改标题）',
        imageUrl: a.imageUrl,
        linkType: 'NONE',
        linkValue: null,
        sortOrder: 0,
        status: 'ACTIVE',
      })
      .expect(200);

    const res = await http()
      .put('/api/v1/admin/banners/reorder')
      .set(auth(token))
      .send({ ids: [c.id, a.id, b.id] })
      .expect(200);

    const rows = res.body.data as BannerRow[];
    expect(rows.map((row) => row.id)).toEqual([c.id, a.id, b.id]);

    // 排序值连续且从 0 开始 —— 不会出现「点了没反应」的重复值
    expect(rows.map((row) => row.sortOrder)).toEqual([0, 1, 2]);

    // 关键：标题与图片**没有被重排改回去**（排序不是整行回写）
    const after = await listBanners();
    const aRow = after.find((row) => row.id === a.id)!;
    expect(aRow.title).toBe('排序 A（已改标题）');
    expect(aRow.imageUrl).toBe(a.imageUrl);
  });

  it('不在给定顺序里的轮播不会被丢弃，追加到末尾', async () => {
    const a = await createBanner('追加用例 A');
    const b = await createBanner('追加用例 B');
    const c = await createBanner('追加用例 C');

    const res = await http()
      .put('/api/v1/admin/banners/reorder')
      .set(auth(token))
      .send({ ids: [c.id] })
      .expect(200);

    const rows = res.body.data as BannerRow[];
    // 之前用例留下的轮播也还在（追加在末尾）
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0].id).toBe(c.id);
    expect(rows.map((row) => row.id)).toContain(a.id);
    expect(rows.map((row) => row.id)).toContain(b.id);
    // 仍然连续
    expect(rows.map((row) => row.sortOrder)).toEqual(rows.map((_row, i) => i));
  });

  it('空列表 → 400；重复 id → 400；不存在的 id → 404', async () => {
    const a = await createBanner('参数校验用例');

    const empty = await http()
      .put('/api/v1/admin/banners/reorder')
      .set(auth(token))
      .send({ ids: [] })
      .expect(400);
    expect(empty.body.code).toBe('VALIDATION_FAILED');

    const dup = await http()
      .put('/api/v1/admin/banners/reorder')
      .set(auth(token))
      .send({ ids: [a.id, a.id] })
      .expect(400);
    expect(dup.body.code).toBe('VALIDATION_FAILED');

    const missing = await http()
      .put('/api/v1/admin/banners/reorder')
      .set(auth(token))
      .send({ ids: ['00000000-0000-4000-8000-000000000000'] })
      .expect(404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });

  it('排序后顾客端看到的顺序与后台一致', async () => {
    const a = await createBanner('顾客端顺序 A');
    const b = await createBanner('顾客端顺序 B');

    await http()
      .put('/api/v1/admin/banners/reorder')
      .set(auth(token))
      .send({ ids: [b.id, a.id] })
      .expect(200);

    const customer = await http().get('/api/v1/banners').expect(200);
    const ids = (customer.body.data as BannerRow[]).map((row) => row.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  });

  it('未登录调用 → 401', async () => {
    await http()
      .put('/api/v1/admin/banners/reorder')
      .send({ ids: [] })
      .expect(401);
  });
});
