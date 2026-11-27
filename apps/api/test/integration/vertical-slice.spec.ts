import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import {
  AdminRole,
  MeasurementType,
  ORDER_STATUS_LABELS,
  PricingMode,
  ProductStatus,
  REQUEST_STATUS_LABELS,
  RequestStatus,
  TemplateStatus,
} from '@qinyang/contracts';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureBodyParsers } from '../../src/common/http/body-parser';
import { AdminUser } from '../../src/database/entities/admin-user.entity';
import { Category } from '../../src/database/entities/category.entity';
import { MeasurementTemplate } from '../../src/database/entities/measurement-template.entity';
import { Product } from '../../src/database/entities/product.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

/**
 * P1–P3 垂直切片集成测试。
 *
 * 覆盖完整定制闭环：
 * 后台上架商品 → 顾客看到商品 → 顾客提交量体申请 → 店员审核 →
 * 店主报价 → 顾客确认报价 → 生成订单 → 店员制作 → 店员发货 → 顾客看到进度。
 *
 * 同时验证权限边界与红线：
 * - 店员不能上下架 / 报价 / 建单
 * - 顾客不能越权查看他人订单
 * - 未确认报价不能上架
 * - 支付接口恒返回 PAYMENT_DISABLED
 * - 关键操作留下审计记录
 */
describe('定制闭环垂直切片', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let templateRepo: Repository<MeasurementTemplate>;
  let productRepo: Repository<Product>;

  let ownerToken: string;
  let staffToken: string;
  let customerToken: string;
  let otherCustomerToken: string;

  let productId: string;
  let categoryId: string;
  let templateId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        // 与生产一致：多余字段直接报错，不静默剥离
        forbidNonWhitelisted: true,
        transform: true,
        validationError: { target: false },
      }),
    );
    // 与生产环境共用同一份请求体上限（JSON 4MB），避免测试通过、线上 413

    configureBodyParsers(app);

    await app.init();

    // 清空测试库，保证每次运行都从干净状态开始
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
    categoryRepo = moduleRef.get<Repository<Category>>(getRepositoryToken(Category));
    templateRepo = moduleRef.get<Repository<MeasurementTemplate>>(
      getRepositoryToken(MeasurementTemplate),
    );
    productRepo = moduleRef.get<Repository<Product>>(getRepositoryToken(Product));

    const hash = await bcrypt.hash('Test@12345', 4);
    await adminRepo.save([
      adminRepo.create({
        username: 'it-owner',
        displayName: '店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
      adminRepo.create({
        username: 'it-staff',
        displayName: '店员',
        passwordHash: hash,
        role: AdminRole.STAFF,
        status: 'ACTIVE' as never,
      }),
    ]);

    const category = await categoryRepo.save(
      categoryRepo.create({
        code: 'it-knitwear',
        name: '针织服饰',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );
    categoryId = category.id;

    const template = await templateRepo.save(
      templateRepo.create({
        code: 'IT-TPL-KNIT',
        name: '集成测试量体模板',
        version: 1,
        status: TemplateStatus.ACTIVE,
        applicableCategories: ['it-knitwear'],
        summary: '集成测试用',
        measurementSections: [
          {
            sectionId: 'body',
            title: '身体测量',
            measurementType: MeasurementType.BODY,
            measurementFields: [
              {
                fieldCode: 'chest_bust',
                fieldName: '胸围',
                measurementType: MeasurementType.BODY,
                unit: 'cm',
                required: true,
                min: 60,
                max: 140,
                step: 0.5,
              },
              {
                fieldCode: 'height',
                fieldName: '身高',
                measurementType: MeasurementType.BODY,
                unit: 'cm',
                required: true,
                min: 140,
                max: 200,
                step: 0.5,
              },
            ],
          },
        ],
      }),
    );
    templateId = template.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ───────────────────────── 认证 ─────────────────────────

  it('管理员登录：店主与店员各自获得令牌与角色', async () => {
    const owner = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-owner', password: 'Test@12345' })
      .expect(200);
    ownerToken = owner.body.data.token;
    expect(owner.body.data.user.role).toBe(AdminRole.OWNER);

    const staff = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-staff', password: 'Test@12345' })
      .expect(200);
    staffToken = staff.body.data.token;
    expect(staff.body.data.user.role).toBe(AdminRole.STAFF);
  });

  it('错误密码被拒绝，且不区分用户不存在与密码错误', async () => {
    const res = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-owner', password: 'wrong-password' })
      .expect(401);
    expect(res.body.message).toBe('用户名或密码不正确');
  });

  it('顾客登录：mock 身份换取令牌', async () => {
    const res = await http()
      .post('/api/v1/auth/login')
      .send({ code: 'dev:it-customer-001' })
      .expect(200);
    customerToken = res.body.data.token;
    expect(res.body.data.token).toBeTruthy();

    const other = await http()
      .post('/api/v1/auth/login')
      .send({ code: 'dev:it-customer-002' })
      .expect(200);
    otherCustomerToken = other.body.data.token;
  });

  it('未登录访问管理端返回 401', async () => {
    await http().get('/api/v1/admin/products').expect(401);
  });

  // ───────────────────────── 商品与上架 ─────────────────────────

  it('店员可以新增商品，但初始状态为 DRAFT', async () => {
    const res = await http()
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        code: 'IT-0001',
        name: '集成测试针织开衫（临时命名·待确认）',
        categoryId,
        pricingMode: 'QUOTE_ONLY',
        priceCents: null,
        measurementTemplateId: templateId,
      })
      .expect(201);

    productId = res.body.data.id;
    expect(res.body.data.status).toBe(ProductStatus.DRAFT);
    // 未确认价格不得出现数字
    expect(res.body.data.priceCents).toBeNull();
  });

  it('顾客看不到未发布商品', async () => {
    const list = await http().get('/api/v1/products').expect(200);
    const ids = list.body.data.items.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(productId);
  });

  it('店员无权上下架（店主专属），返回 403', async () => {
    const res = await http()
      .post(`/api/v1/admin/products/${productId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: ProductStatus.PUBLISHED })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('草稿不能直接上架，必须先提交审核', async () => {
    const res = await http()
      .post(`/api/v1/admin/products/${productId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: ProductStatus.PUBLISHED })
      .expect(409);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('店主提交审核并上架后，顾客可见且价格为「待报价」（null）', async () => {
    await http()
      .post(`/api/v1/admin/products/${productId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: ProductStatus.PENDING_REVIEW })
      .expect(200);

    await http()
      .post(`/api/v1/admin/products/${productId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: ProductStatus.PUBLISHED })
      .expect(200);

    const list = await http().get('/api/v1/products').expect(200);
    const item = list.body.data.items.find((row: { id: string }) => row.id === productId);
    expect(item).toBeTruthy();
    expect(item.pricingMode).toBe('QUOTE_ONLY');
    expect(item.priceCents).toBeNull();
  });

  it('非法状态迁移被拒绝', async () => {
    const res = await http()
      .post(`/api/v1/admin/products/${productId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: ProductStatus.DRAFT })
      .expect(409);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  // ───────────────────────── 定制申请 ─────────────────────────

  const measurements = [
    {
      fieldCode: 'chest_bust',
      fieldName: '胸围',
      measurementType: MeasurementType.BODY,
      unit: 'cm',
      value: 92,
    },
    {
      fieldCode: 'height',
      fieldName: '身高',
      measurementType: MeasurementType.BODY,
      unit: 'cm',
      value: 165,
    },
  ];

  const contact = {
    name: '测试顾客',
    phone: '13800000000',
    region: '内蒙古自治区 呼和浩特市',
    detail: '赛罕区测试路 1 号（虚构数据）',
  };

  it('按商品解析量体模板', async () => {
    const res = await http()
      .get('/api/v1/measurement-templates/resolve')
      .query({ productId })
      .expect(200);
    expect(res.body.data.templateCode).toBe('IT-TPL-KNIT');
    expect(res.body.data.measurementSections).toHaveLength(1);
  });

  it('顾客提交定制申请，状态为待审核', async () => {
    const res = await http()
      .post('/api/v1/customization-requests')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        productId,
        measurements,
        contact,
        remark: '袖长请按 56cm 制作',
        submitId: 'it-submit-001',
      })
      .expect(201);

    expect(res.body.data.status).toBe(RequestStatus.PENDING_REVIEW);
    expect(res.body.data.statusLabel).toBe(REQUEST_STATUS_LABELS[RequestStatus.PENDING_REVIEW]);
    expect(res.body.data.measurements.fields).toHaveLength(2);
  });

  it('重复提交同一 submitId 幂等（不产生第二条申请）', async () => {
    const res = await http()
      .post('/api/v1/customization-requests')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        productId,
        measurements,
        contact,
        submitId: 'it-submit-001',
      })
      .expect(201);
    expect(res.body.data.requestNo).toBeTruthy();

    const list = await http()
      .get('/api/v1/customization-requests')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(list.body.data.total).toBe(1);
  });

  it('量体数据越界时拒绝提交', async () => {
    const res = await http()
      .post('/api/v1/customization-requests')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        productId,
        measurements: [{ ...measurements[0], value: 500 }, measurements[1]],
        contact,
        submitId: 'it-submit-002',
      })
      .expect(400);
    expect(res.body.code).toBe('MEASUREMENT_INVALID');
  });

  it('顾客看不到他人的申请', async () => {
    const mine = await http()
      .get('/api/v1/customization-requests')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const requestId = mine.body.data.items[0].id;

    await http()
      .get(`/api/v1/customization-requests/${requestId}`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .expect(404);
  });

  it('店员审核通过，状态转为待报价', async () => {
    const list = await http()
      .get('/api/v1/admin/customization-requests')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    const requestId = list.body.data.items[0].id;

    const res = await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/review`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ action: 'APPROVE', note: '量体资料齐全' })
      .expect(200);
    expect(res.body.data.status).toBe(RequestStatus.PENDING_QUOTE);
  });

  // ───────────────────────── 报价 ─────────────────────────

  it('店员无权创建报价（店主专属），返回 403', async () => {
    const list = await http()
      .get('/api/v1/admin/customization-requests')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    const requestId = list.body.data.items[0].id;

    const res = await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ amountCents: 128000, freightCents: 0, productionDays: 21 })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  let quoteId: string;
  let requestId: string;

  it('店主创建报价，金额为整数分，版本为 1', async () => {
    const list = await http()
      .get('/api/v1/admin/customization-requests')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    requestId = list.body.data.items[0].id;

    const res = await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        amountCents: 128000,
        freightCents: 0,
        productionDays: 21,
        validUntil: new Date(Date.now() + 7 * 86400_000).toISOString(),
        note: '按量体数据定制，含手工缝制',
      })
      .expect(201);

    quoteId = res.body.data.id;
    expect(res.body.data.version).toBe(1);
    expect(res.body.data.amountCents).toBe(128000);
    expect(res.body.data.totalCents).toBe(128000);
    expect(res.body.data.status).toBe('ACTIVE');
    // 报价冻结商品与量体快照
    expect(res.body.data.productSnapshot.code).toBe('IT-0001');
    expect(res.body.data.measurementSnapshot.fields).toHaveLength(2);
  });

  it('创建新报价时旧版本转 SUPERSEDED，并只保留一个有效版本', async () => {
    const res = await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amountCents: 138000, freightCents: 0, productionDays: 21 })
      .expect(201);

    expect(res.body.data.version).toBe(2);
    quoteId = res.body.data.id;

    const history = await http()
      .get(`/api/v1/admin/customization-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(history.body.data).toHaveLength(2);
    const active = history.body.data.filter(
      (item: { status: string }) => item.status === 'ACTIVE',
    );
    expect(active).toHaveLength(1);
    expect(active[0].version).toBe(2);
  });

  it('未确认报价的申请不能建单', async () => {
    const res = await http()
      .post('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ requestId, quoteId })
      .expect(409);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('顾客用旧版本号确认报价被拒绝', async () => {
    const res = await http()
      .post(`/api/v1/customization-requests/${requestId}/confirm-quote`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ quoteId, expectedVersion: 1 })
      .expect(409);
    expect(res.body.code).toBe('QUOTE_VERSION_CONFLICT');
  });

  it('顾客确认当前有效报价，申请转为已确认', async () => {
    const res = await http()
      .post(`/api/v1/customization-requests/${requestId}/confirm-quote`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ quoteId, expectedVersion: 2 })
      .expect(200);
    expect(res.body.data.confirmedAt).toBeTruthy();

    const detail = await http()
      .get(`/api/v1/customization-requests/${requestId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(detail.body.data.status).toBe(RequestStatus.CONFIRMED);
  });

  // ───────────────────────── 订单 ─────────────────────────

  let orderId: string;

  it('店主由已确认申请生成订单，快照来自报价', async () => {
    const res = await http()
      .post('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ requestId, quoteId })
      .expect(201);

    orderId = res.body.data.id;
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.data.quoteVersion).toBe(2);
    expect(res.body.data.amountCents).toBe(138000);
    expect(res.body.data.totalCents).toBe(138000);
    expect(res.body.data.productSnapshot.code).toBe('IT-0001');
  });

  it('已发布商品的价格只有店主能改（店员改价被拒）', async () => {
    // 店员直接把在售商品的价格改掉 → 顾客端展示的金额会在一次「保存」里悄悄变化
    const rejected = await http()
      .put(`/api/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        code: 'IT-0001',
        name: '改价改名前的商品（临时命名·待确认）',
        categoryId,
        pricingMode: 'FIXED_PRICE',
        priceCents: 99900,
        measurementTemplateId: templateId,
      })
      .expect(409);
    expect(rejected.body.code).toBe('FORBIDDEN');
  });

  it('后台改商品不影响已生成订单的历史快照', async () => {
    // 店主改文案（不改价）→ 允许
    await http()
      .put(`/api/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        code: 'IT-0001',
        name: '改价改名前的商品（临时命名·待确认）',
        categoryId,
        pricingMode: 'FIXED_PRICE',
        priceCents: 138000,
        measurementTemplateId: templateId,
      })
      .expect(200);

    const order = await http()
      .get(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(200);
    expect(order.body.data.productSnapshot.name).toContain('集成测试针织开衫');
    expect(order.body.data.amountCents).toBe(138000);
  });

  it('订单状态非法跳转被拒绝', async () => {
    const res = await http()
      .post(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'COMPLETED' })
      .expect(409);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('店员更新制作状态并填写物流，顾客能看到进度', async () => {
    await http()
      .post(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'IN_PRODUCTION', note: '开始手工缝制' })
      .expect(200);

    const shipped = await http()
      .post(`/api/v1/admin/orders/${orderId}/ship`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ carrier: '顺丰速运', trackingNo: 'SF0000000001' })
      .expect(200);
    expect(shipped.body.data.status).toBe('SHIPPED');
    expect(shipped.body.data.trackingNo).toBe('SF0000000001');

    const mine = await http()
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(mine.body.data.statusLabel).toBe(ORDER_STATUS_LABELS.SHIPPED);
    expect(mine.body.data.events.length).toBeGreaterThanOrEqual(3);
  });

  it('顾客不能查看他人订单', async () => {
    await http()
      .get(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .expect(404);
  });

  it('订单完成后申请状态同步为已完成', async () => {
    await http()
      .post(`/api/v1/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'COMPLETED' })
      .expect(200);

    const detail = await http()
      .get(`/api/v1/customization-requests/${requestId}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    expect(detail.body.data.status).toBe(RequestStatus.COMPLETED);
  });

  // ───────────────────────── 红线 ─────────────────────────

  it('支付接口恒返回 PAYMENT_DISABLED，不伪造已支付状态', async () => {
    const res = await http()
      .post(`/api/v1/admin/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
    expect(res.body.code).toBe('PAYMENT_DISABLED');

    const record = await http()
      .get(`/api/v1/admin/orders/${orderId}/payment`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(record.body.data.status).toBe('DISABLED');
  });

  it('关键操作留下审计记录，且不包含量体与联系方式明文', async () => {
    const res = await http()
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const actions = res.body.data.items.map((item: { action: string }) => item.action);
    expect(actions).toContain('product.status.published');
    expect(actions).toContain('quote.create');
    expect(actions).toContain('order.create');
    expect(actions).toContain('order.ship');

    const serialized = JSON.stringify(res.body.data);
    expect(serialized).not.toContain('13800000000');
    expect(serialized).not.toContain('赛罕区测试路');
  });

  it('店员看不到审计日志（店主专属）', async () => {
    await http()
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
  });

  it('管理员可以下架商品，顾客随即看不到', async () => {
    await http()
      .post(`/api/v1/admin/products/${productId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: ProductStatus.OFFLINE })
      .expect(200);

    const list = await http().get('/api/v1/products').expect(200);
    const ids = list.body.data.items.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(productId);

    const detail = await http().get(`/api/v1/products/${productId}`).expect(404);
    expect(detail.body.code).toBe('NOT_FOUND');
  });

  it('商品确实写入数据库（不是内存假数据）', async () => {
    const stored = await productRepo.findOne({ where: { code: 'IT-0001' } });
    expect(stored).toBeTruthy();
    expect(stored?.status).toBe(ProductStatus.OFFLINE);
  });
});

/**
 * 分类层级语义的回归测试（独立 describe，避免污染上面的垂直切片）。
 *
 * 守的是一个真实缺陷：商品挂在**二级分组**上，而顾客端的分类页默认按
 * **一级分类 id** 查询。原先 `categoryId` 是精确匹配，一级分类下必然 0 件 ——
 * 顾客打开分类页看到的是空列表。
 */
describe('分类层级语义', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let templateRepo: Repository<MeasurementTemplate>;
  let productRepo: Repository<Product>;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        // 与生产一致：多余字段直接报错，不静默剥离
        forbidNonWhitelisted: true,
        transform: true,
        validationError: { target: false },
      }),
    );
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
    categoryRepo = moduleRef.get<Repository<Category>>(getRepositoryToken(Category));
    templateRepo = moduleRef.get<Repository<MeasurementTemplate>>(
      getRepositoryToken(MeasurementTemplate),
    );
    productRepo = moduleRef.get<Repository<Product>>(getRepositoryToken(Product));

    const hash = await bcrypt.hash('Test@12345', 4);
    await adminRepo.save(
      adminRepo.create({
        username: 'it-cat-owner',
        displayName: '店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
    );

    const top = await categoryRepo.save(
      categoryRepo.create({
        code: 'it-outerwear',
        name: '外穿服饰',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );
    const group = await categoryRepo.save(
      categoryRepo.create({
        code: 'it-outerwear-coat',
        name: '大衣',
        parentId: top.id,
        level: 2,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );

    const template = await templateRepo.save(
      templateRepo.create({
        code: 'IT-CAT-TPL',
        name: '集成测试模板',
        version: 1,
        status: TemplateStatus.ACTIVE,
        applicableCategories: ['it-outerwear'],
        summary: '集成测试',
        measurementSections: [
          {
            sectionId: 'body',
            title: '身体测量',
            measurementType: MeasurementType.BODY,
            measurementFields: [
              {
                fieldCode: 'chest_bust',
                fieldName: '胸围',
                measurementType: MeasurementType.BODY,
                unit: 'cm',
                required: true,
                min: 60,
                max: 140,
                step: 0.5,
              },
            ],
          },
        ] as never,
      }),
    );

    // 商品挂在**二级分组**上
    await productRepo.save(
      productRepo.create({
        code: 'IT-CAT-0001',
        name: '集成测试大衣（临时命名·待确认）',
        categoryId: group.id,
        pricingMode: PricingMode.QUOTE_ONLY,
        priceCents: null,
        material: null,
        description: null,
        careGuide: null,
        measurementTemplateId: template.id,
        sortOrder: 0,
        status: ProductStatus.PUBLISHED,
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('按一级分类 id 查询，能取到其下二级分组的商品', async () => {
    const tree = await http().get('/api/v1/categories').expect(200);
    const top = tree.body.data.find((c: { code: string }) => c.code === 'it-outerwear');
    expect(top).toBeTruthy();

    const list = await http()
      .get(`/api/v1/products?categoryId=${top.id}&pageSize=20`)
      .expect(200);
    expect(list.body.data.total).toBe(1);
    expect(list.body.data.items[0].code).toBe('IT-CAT-0001');
  });

  it('按二级分组 id 查询，同样能取到该分组的商品', async () => {
    const tree = await http().get('/api/v1/categories').expect(200);
    const top = tree.body.data.find((c: { code: string }) => c.code === 'it-outerwear');
    const group = top.children.find((c: { code: string }) => c.code === 'it-outerwear-coat');

    const list = await http()
      .get(`/api/v1/products?categoryId=${group.id}&pageSize=20`)
      .expect(200);
    expect(list.body.data.total).toBe(1);
  });

  it('分类树里一级分类的商品数已向下汇总（不再是 0）', async () => {
    const tree = await http().get('/api/v1/categories').expect(200);
    const top = tree.body.data.find((c: { code: string }) => c.code === 'it-outerwear');
    expect(top.productCount).toBe(1);
    expect(top.children[0].productCount).toBe(1);
  });

  it('商品详情带出量体模板名称（契约字段，此前恒为 null）', async () => {
    const list = await http().get('/api/v1/products?pageSize=5').expect(200);
    const detail = await http()
      .get(`/api/v1/products/${list.body.data.items[0].id}`)
      .expect(200);
    expect(detail.body.data.measurementTemplateName).toBe('集成测试模板');
  });
});
