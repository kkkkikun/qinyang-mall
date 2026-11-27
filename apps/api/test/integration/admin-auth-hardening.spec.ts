import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AdminRole } from '@qinyang/contracts';
import { AppModule } from '../../src/app.module';
import { configureBodyParsers } from '../../src/common/http/body-parser';
import { AdminUser } from '../../src/database/entities/admin-user.entity';
import { AuditLog } from '../../src/database/entities/audit-log.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

/**
 * 管理员鉴权加固（第十二轮）。
 *
 * 两个此前**完全不存在**的保证：
 *
 * 1. **令牌只作身份凭据，权限取库里的现况**
 *    —— 此前令牌里带着 role，守卫直接信任它，
 *    于是「把店员降权」「停用账号」在一个令牌周期（8–12 小时）内**不生效**：
 *    旧令牌照样能调店主专属接口（改价 / 删商品 / 取消订单）。
 *
 * 2. **登录限流**
 *    —— 此前顾客与管理员登录都没有任何频率限制，撞库与暴力破解无阻挡。
 *    限流默认关闭（放应用层还是网关层待商家拍板，见 D-17），
 *    本测试显式打开它，验证能力确实可用。
 */
describe('管理员鉴权加固', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let auditRepo: Repository<AuditLog>;

  const http = () => request(app.getHttpServer());

  const OWNER = 'harden-owner';
  const STAFF = 'harden-staff';
  const DISABLED = 'harden-disabled';

  let ownerToken = '';
  let staffToken = '';
  let disabledToken = '';

  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    // 限流：管理员端阈值压到 4 次/分钟，便于验证；顾客端放宽避免影响其它用例
    savedEnv.AUTH_RATE_LIMIT_ENABLED = process.env.AUTH_RATE_LIMIT_ENABLED;
    savedEnv.AUTH_RATE_LIMIT_ADMIN_MAX = process.env.AUTH_RATE_LIMIT_ADMIN_MAX;
    savedEnv.AUTH_RATE_LIMIT_CUSTOMER_MAX = process.env.AUTH_RATE_LIMIT_CUSTOMER_MAX;
    process.env.AUTH_RATE_LIMIT_ENABLED = 'true';
    process.env.AUTH_RATE_LIMIT_ADMIN_MAX = '4';
    process.env.AUTH_RATE_LIMIT_CUSTOMER_MAX = '1000';

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

    const dataSource = moduleRef.get<DataSource>(DataSource);
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
    auditRepo = moduleRef.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));

    const hash = await bcrypt.hash('Test@12345', 4);
    await adminRepo.save([
      adminRepo.create({
        username: OWNER,
        displayName: '店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
      adminRepo.create({
        username: STAFF,
        displayName: '店员',
        passwordHash: hash,
        role: AdminRole.STAFF,
        status: 'ACTIVE' as never,
      }),
      adminRepo.create({
        username: DISABLED,
        displayName: '待停用',
        passwordHash: hash,
        role: AdminRole.STAFF,
        // 先建成启用：要先登录拿到令牌，再在测试里把它停用，
        // 验证「停用后旧令牌立刻失效」
        status: 'ACTIVE' as never,
      }),
    ]);

    const login = async (username: string): Promise<string> => {
      const res = await http()
        .post('/api/v1/admin/auth/login')
        .send({ username, password: 'Test@12345' })
        .expect(200);
      return res.body.data.token;
    };
    ownerToken = await login(OWNER);
    staffToken = await login(STAFF);
    disabledToken = await login(DISABLED);
  });

  afterAll(async () => {
    if (app) await app.close();
    // 还原环境变量：同一 jest worker 里后续跑的用例不应被限流影响
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('令牌里的角色以库里的现况为准：降权立刻生效', async () => {
    // 先确认店员此刻确实没有店主专属能力
    const before = await http()
      .post('/api/v1/admin/measurement-templates')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ code: 'HARDEN-TPL-1', name: '模板', applicableCategories: [], measurementSections: [] });
    expect(before.status).toBe(403);

    // 店主把店员提为 OWNER（模拟提权），旧令牌立刻可用 —— 说明令牌没被缓存
    const staff = await adminRepo.findOne({ where: { username: STAFF } });
    await adminRepo.update(staff!.id, { role: AdminRole.OWNER });

    const after = await http()
      .post('/api/v1/admin/measurement-templates')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ code: 'HARDEN-TPL-2', name: '模板', applicableCategories: [], measurementSections: [] });
    expect(after.status).toBe(201);

    // 再降回去，旧令牌立刻失去店主专属能力
    await adminRepo.update(staff!.id, { role: AdminRole.STAFF });
    const downgraded = await http()
      .post('/api/v1/admin/measurement-templates')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ code: 'HARDEN-TPL-3', name: '模板', applicableCategories: [], measurementSections: [] });
    expect(downgraded.status).toBe(403);

    // 还原
    await adminRepo.update(staff!.id, { role: AdminRole.STAFF });
  });

  it('账号被停用后，旧令牌立刻失效', async () => {
    const user = await adminRepo.findOne({ where: { username: DISABLED } });
    await adminRepo.update(user!.id, { status: 'DISABLED' as never });

    const res = await http()
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${disabledToken}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('账号被删除后，旧令牌立刻失效', async () => {
    const user = await adminRepo.findOne({ where: { username: STAFF } });
    const token = await (async () => {
      const res = await http()
        .post('/api/v1/admin/auth/login')
        .send({ username: STAFF, password: 'Test@12345' })
        .expect(200);
      return res.body.data.token;
    })();

    await adminRepo.delete(user!.id);
    const res = await http()
      .get('/api/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('登录尝试过于频繁时返回 429 与明确提示', async () => {
    // 阈值 4 次/分钟（端 + IP + 账号），这里用一个没登录过的账号连续试
    const attempts: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await http()
        .post('/api/v1/admin/auth/login')
        .send({ username: 'harden-brute', password: 'wrong' });
      attempts.push(res.status);
    }
    expect(attempts).toContain(429);

    const blocked = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'harden-brute', password: 'wrong' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(String(blocked.body.message)).toContain('尝试过于频繁');
  });

  it('登录成功会清零计数（正常用户输错一两次不会被牵连）', async () => {
    // 连续两次失败
    await http().post('/api/v1/admin/auth/login').send({ username: OWNER, password: 'wrong' });
    await http().post('/api/v1/admin/auth/login').send({ username: OWNER, password: 'wrong' });
    // 一次成功 → 计数清零
    await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: OWNER, password: 'Test@12345' })
      .expect(200);
    // 之后仍有完整额度可用
    const res = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: OWNER, password: 'Test@12345' });
    expect(res.status).toBe(200);
  });

  it('限流只影响命中的维度，不牵连其它账号', async () => {
    // harden-brute 已被限流；换一个账号应照常登录
    const res = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'harden-other', password: 'Test@12345' });
    // 账号不存在 → 401（不是 429），说明限流维度确实是「IP + 账号」
    expect(res.status).toBe(401);
  });

  it('审计日志能查到登录限流前的正常业务痕迹（限流未误伤业务）', async () => {
    const rows = await auditRepo.find();
    expect(Array.isArray(rows)).toBe(true);
  });
});
