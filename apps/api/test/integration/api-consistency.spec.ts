import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import {
  AdminRole,
  MeasurementType,
  MediaRole,
  PricingMode,
  ProductStatus,
  QuoteStatus,
  RequestStatus,
  TemplateStatus,
} from '@qinyang/contracts';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureBodyParsers } from '../../src/common/http/body-parser';
import { AdminUser } from '../../src/database/entities/admin-user.entity';
import { Category } from '../../src/database/entities/category.entity';
import { Customer } from '../../src/database/entities/customer.entity';
import { CustomizationRequest } from '../../src/database/entities/customization-request.entity';
import { MeasurementTemplate } from '../../src/database/entities/measurement-template.entity';
import { Order } from '../../src/database/entities/order.entity';
import { PaymentRecord } from '../../src/database/entities/payment-record.entity';
import { Product } from '../../src/database/entities/product.entity';
import { ProductMedia } from '../../src/database/entities/product-media.entity';
import { Quote } from '../../src/database/entities/quote.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

/**
 * 一致性回归。
 *
 * 这一组用例守的是「并发与状态口径」层面的商业事实：
 *
 * 1. 店员取消申请与顾客确认报价同时发生时，**只能有一个动作生效**，
 *    不能出现「确认把取消回滚」——店员刚做的取消被静默撤销是最难查的一类问题；
 * 2. 改申请状态是店主专属，且已生成订单的申请不能从申请侧取消（否则状态分裂）；
 * 3. 顾客并发首登不会 500，也不会留下两条顾客记录；
 * 4. 商品并发编辑是 409 而不是 500；
 * 5. 图集并发加同一张图只有一条；
 * 6. 列表封面与详情封面口径一致（只有 DETAIL 图的商品也有封面）；
 * 7. 分类并发创建同 code 是 409 而不是 500；
 * 8. 支付接口恒返回 409 PAYMENT_DISABLED，且只留一条支付记录；
 * 9. CSV 价格用十进制字符串换算，最多两位小数；
 * 10. 申请退回「待报价」时，有效报价一并撤回（否则顾客端死结）。
 */
describe('一致性回归', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let customerRepo: Repository<Customer>;
  let requestRepo: Repository<CustomizationRequest>;
  let templateRepo: Repository<MeasurementTemplate>;
  let orderRepo: Repository<Order>;
  let paymentRepo: Repository<PaymentRecord>;
  let productRepo: Repository<Product>;
  let mediaRepo: Repository<ProductMedia>;
  let quoteRepo: Repository<Quote>;

  let ownerToken: string;
  let staffToken: string;
  let customerToken: string;
  let productId: string;
  let categoryId: string;
  let categoryCode: string;
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
        forbidNonWhitelisted: true,
        transform: true,
        validationError: { target: false },
      }),
    );
    // 与生产环境共用同一份请求体上限（JSON 4MB），避免测试通过、线上 413
    configureBodyParsers(app);

    await app.init();

    const dataSourceRef = moduleRef.get(DataSource);
    dataSource = dataSourceRef;
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
    customerRepo = moduleRef.get<Repository<Customer>>(getRepositoryToken(Customer));
    requestRepo = moduleRef.get<Repository<CustomizationRequest>>(
      getRepositoryToken(CustomizationRequest),
    );
    templateRepo = moduleRef.get<Repository<MeasurementTemplate>>(
      getRepositoryToken(MeasurementTemplate),
    );
    orderRepo = moduleRef.get<Repository<Order>>(getRepositoryToken(Order));
    paymentRepo = moduleRef.get<Repository<PaymentRecord>>(getRepositoryToken(PaymentRecord));
    productRepo = moduleRef.get<Repository<Product>>(getRepositoryToken(Product));
    mediaRepo = moduleRef.get<Repository<ProductMedia>>(getRepositoryToken(ProductMedia));
    quoteRepo = moduleRef.get<Repository<Quote>>(getRepositoryToken(Quote));

    const hash = await bcrypt.hash('Test@12345', 4);
    await adminRepo.save([
      adminRepo.create({
        username: 'it-cons-owner',
        displayName: '店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
      adminRepo.create({
        username: 'it-cons-staff',
        displayName: '店员',
        passwordHash: hash,
        role: AdminRole.STAFF,
        status: 'ACTIVE' as never,
      }),
    ]);

    categoryCode = 'it-cons-cat';
    const category = await categoryRepo.save(
      categoryRepo.create({
        code: categoryCode,
        name: '一致性测试分类',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );
    categoryId = category.id;

    const template = await templateRepo.save(
      templateRepo.create({
        code: 'IT-TPL-CONS',
        name: '一致性测试模板',
        version: 1,
        status: TemplateStatus.ACTIVE,
        applicableCategories: [category.id],
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
            ],
          },
        ],
      }),
    );
    templateId = template.id;

    const owner = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-cons-owner', password: 'Test@12345' })
      .expect(200);
    ownerToken = owner.body.data.token;

    const staff = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-cons-staff', password: 'Test@12345' })
      .expect(200);
    staffToken = staff.body.data.token;

    const product = await productRepo.save(
      productRepo.create({
        code: 'IT-PROD-CONS',
        name: '一致性测试商品',
        categoryId,
        pricingMode: PricingMode.QUOTE_ONLY,
        priceCents: null,
        measurementTemplateId: templateId,
        status: ProductStatus.PUBLISHED,
        sortOrder: 0,
        createdById: owner.body.data.user.id,
      }),
    );
    productId = product.id;

    const cust = await http()
      .post('/api/v1/auth/login')
      .send({ code: 'dev:it-consistency' })
      .expect(200);
    customerToken = cust.body.data.token;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ───────────────────────── 辅助方法 ─────────────────────────

  /** 新建一条定制申请（待审核） */
  async function createRequest(submitId: string): Promise<string> {
    const created = await http()
      .post('/api/v1/customization-requests')
      .set('x-customer-token', customerToken)
      .send({
        productId,
        measurements: [
          {
            fieldCode: 'chest_bust',
            fieldName: '胸围',
            measurementType: MeasurementType.BODY,
            unit: 'cm',
            value: 96,
          },
        ],
        contact: { name: '一致性顾客', phone: '13800008888', region: '内蒙古 呼和浩特', detail: '测试' },
        submitId,
      })
      .expect(201);
    return created.body.data.id;
  }

  /** 审核通过 → 待报价 */
  async function review(requestId: string, note = '审核通过'): Promise<void> {
    await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ action: 'APPROVE', note })
      .expect(200);
  }

  /** 店主报价 → 已报价，返回报价 */
  async function quote(requestId: string, amountCents = 288000): Promise<any> {
    const res = await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amountCents, freightCents: 2000, productionDays: 25 })
      .expect(201);
    return res.body.data;
  }

  /** 顾客确认报价 → 已确认 */
  async function confirm(requestId: string, q: any): Promise<void> {
    await http()
      .post(`/api/v1/customization-requests/${requestId}/confirm-quote`)
      .set('x-customer-token', customerToken)
      .send({ quoteId: q.id, expectedVersion: q.version })
      .expect(200);
  }

  /** 造一件已发布商品 */
  async function createProduct(code: string, name: string): Promise<string> {
    const created = await productRepo.save(
      productRepo.create({
        code,
        name,
        categoryId,
        pricingMode: PricingMode.QUOTE_ONLY,
        priceCents: null,
        measurementTemplateId: templateId,
        status: ProductStatus.PUBLISHED,
        sortOrder: 0,
        createdById: null,
      }),
    );
    return created.id;
  }

  // ───────────────────────── 用例 ─────────────────────────

  it('A1 店员取消申请与顾客确认报价并发：只有一个动作生效，取消不会被回滚', async () => {
    const requestId = await createRequest('cons-a1');
    await review(requestId, '审核备注');
    const q = await quote(requestId);

    const [cancel, confirmRes] = await Promise.all([
      http()
        .put(`/api/v1/admin/customization-requests/${requestId}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: RequestStatus.CANCELLED, note: '店员取消申请' }),
      http()
        .post(`/api/v1/customization-requests/${requestId}/confirm-quote`)
        .set('x-customer-token', customerToken)
        .send({ quoteId: q.id, expectedVersion: q.version }),
    ]);

    // 两个动作只能有一个成功（数据库裁决，另一个拿到 409）
    expect([cancel.status, confirmRes.status].filter((s) => s < 300).length).toBe(1);

    const final = await requestRepo.findOne({ where: { id: requestId } });
    if (cancel.status === 200) {
      // 店员取消成功 → 申请必须停在「已取消」，不能被顾客确认回滚成「已确认」
      expect(final?.status).toBe(RequestStatus.CANCELLED);
      // 审核备注也不能被陈旧值覆盖
      expect(final?.remark).toBe('店员取消申请');
    } else {
      expect(confirmRes.status).toBe(200);
      expect(final?.status).toBe(RequestStatus.CONFIRMED);
    }
  });

  it('A2 店员不能改申请状态（店主专属），店主可以', async () => {
    const requestId = await createRequest('cons-a2-role');

    const forbidden = await http()
      .put(`/api/v1/admin/customization-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: RequestStatus.CANCELLED })
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const allowed = await http()
      .put(`/api/v1/admin/customization-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: RequestStatus.CANCELLED })
      .expect(200);
    expect(allowed.body.data.status).toBe(RequestStatus.CANCELLED);
  });

  it('A2 已生成订单的申请不能从申请侧取消（否则申请与订单状态分裂）', async () => {
    const requestId = await createRequest('cons-a2-order');
    await review(requestId);
    const q = await quote(requestId);
    await confirm(requestId, q);
    const order = await http()
      .post('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ requestId, quoteId: q.id })
      .expect(201);

    const res = await http()
      .put(`/api/v1/admin/customization-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: RequestStatus.CANCELLED })
      .expect(409);
    expect(String(res.body.message)).toContain('已生成订单');

    // 订单本身仍然是「已确认」，没有被申请侧的操作带偏
    const row = await orderRepo.findOne({ where: { id: order.body.data.id } });
    expect(row?.status).toBe('CONFIRMED');
  });

  it('A3 并发首次登录：两次都成功，customers 表只有一行', async () => {
    const [a, b] = await Promise.all([
      http().post('/api/v1/auth/login').send({ code: 'dev:it-consistency-login' }),
      http().post('/api/v1/auth/login').send({ code: 'dev:it-consistency-login' }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const rows = await customerRepo.find({ where: { openid: 'mock:it-consistency-login' } });
    expect(rows.length).toBe(1);
  });

  it('A4 并发修改同一件商品：一方成功，另一方 409（不是 500）', async () => {
    const payload = {
      code: 'IT-PROD-CONS',
      name: '一致性测试商品',
      categoryId,
      pricingMode: PricingMode.QUOTE_ONLY,
      priceCents: null,
      measurementTemplateId: templateId,
      sortOrder: 0,
    };

    /*
     * 要触发乐观锁，两个请求必须**读到同一个版本**。
     * 直接并发两个请求是在抢时间：后一个请求可能在前一个保存之后才读，
     * 于是两次都成功（没有冲突可报），用例就变成了 flaky。
     *
     * 这里用一把行锁把时序钉死：
     * - 先在事务里锁住商品行；
     * - 两个请求的「读」（一致性读，不被行锁阻塞）都拿到旧版本；
     * - 它们的「写」则排在锁后面 —— 放锁后先到者成功，
     *   后到者发现版本已被顶掉 → 乐观锁冲突 → 409（不是 500）。
     */
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    await runner.query('SELECT id FROM `products` WHERE id = ? FOR UPDATE', [productId]);

    const pending = Promise.all([
      http()
        .put(`/api/v1/admin/products/${productId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...payload, name: '并发改名甲' }),
      http()
        .put(`/api/v1/admin/products/${productId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ ...payload, name: '并发改名乙' }),
    ]);

    // 给两个请求留出「读到旧版本 → 写入排队」的时间
    await new Promise((resolve) => setTimeout(resolve, 500));
    await runner.commitTransaction();
    await runner.release();

    const [a, b] = await pending;
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect([a.body.code, b.body.code]).toContain('INVALID_STATUS_TRANSITION');
  });

  it('A6 并发添加同一张图：图集里只有一条', async () => {
    const product = await createProduct('IT-MEDIA-CONS', '并发加图商品');

    const [a, b] = await Promise.all([
      http()
        .post(`/api/v1/admin/products/${product}/media`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          role: MediaRole.DETAIL,
          storageKey: 'products/IT-MEDIA-CONS/A.jpg',
          url: 'http://x/a.jpg',
        }),
      http()
        .post(`/api/v1/admin/products/${product}/media`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          role: MediaRole.DETAIL,
          storageKey: 'products/IT-MEDIA-CONS/A.jpg',
          url: 'http://x/a.jpg',
        }),
    ]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    const rows = await mediaRepo.find({ where: { productId: product } });
    expect(rows.length).toBe(1);
  });

  it('A7 只有 DETAIL 图的商品：列表封面与详情封面一致且非空', async () => {
    const product = await createProduct('IT-COVER-ONLY', '只有细节图的商品');
    await http()
      .post(`/api/v1/admin/products/${product}/media`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        role: MediaRole.DETAIL,
        storageKey: 'products/IT-COVER-ONLY/D.jpg',
        url: 'http://x/d.jpg',
      })
      .expect(201);

    const list = await http().get('/api/v1/products?pageSize=100').expect(200);
    const item = list.body.data.items.find((row: { id: string }) => row.id === product);
    expect(item).toBeTruthy();
    expect(item.coverUrl).toBe('http://x/d.jpg');

    const detail = await http().get(`/api/v1/products/${product}`).expect(200);
    expect(detail.body.data.coverUrl).toBe(item.coverUrl);
  });

  it('A9 并发创建同 code 分类：一方 201，一方 409', async () => {
    const [a, b] = await Promise.all([
      http()
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ code: 'it-cons-dup', name: '并发分类' }),
      http()
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ code: 'it-cons-dup', name: '并发分类' }),
    ]);

    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const rows = await categoryRepo.find({ where: { code: 'it-cons-dup' } });
    expect(rows.length).toBe(1);
  });

  it('A11 并发支付：两次都 409 PAYMENT_DISABLED，支付记录只有一条', async () => {
    const requestId = await createRequest('cons-a11');
    await review(requestId);
    const q = await quote(requestId);
    await confirm(requestId, q);
    const order = await http()
      .post('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ requestId, quoteId: q.id })
      .expect(201);
    const orderId = order.body.data.id;

    const [a, b] = await Promise.all([
      http().post(`/api/v1/admin/orders/${orderId}/pay`).set('Authorization', `Bearer ${ownerToken}`),
      http().post(`/api/v1/admin/orders/${orderId}/pay`).set('Authorization', `Bearer ${ownerToken}`),
    ]);

    expect(a.status).toBe(409);
    expect(b.status).toBe(409);
    expect(a.body.code).toBe('PAYMENT_DISABLED');
    expect(b.body.code).toBe('PAYMENT_DISABLED');

    const records = await paymentRepo.find({ where: { orderId } });
    expect(records.length).toBe(1);
  });

  it('A12 CSV 价格：超过两位小数判错，两位小数按十进制字符串换算', async () => {
    const headers =
      '商品编号,商品名称,分类编号,报价模式,价格(元),材质,副标题,商品简介,洗护说明,量体模板编号,排序';
    const csv = [
      headers,
      `CONS-PRICE-BAD,三位小数,${categoryCode},固定价可直售,8.115,,,,,`,
      `CONS-PRICE-OK,两位小数,${categoryCode},固定价可直售,19.99,,,,,`,
    ].join('\n');

    const res = await http()
      .post('/api/v1/admin/products/import')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ csv, dryRun: false })
      .expect(200);

    const bad = res.body.data.rows.find((row: { code: string }) => row.code === 'CONS-PRICE-BAD');
    expect(bad.status).toBe('FAILED');
    expect(String(bad.reason)).toContain('两位小数');

    const ok = res.body.data.rows.find((row: { code: string }) => row.code === 'CONS-PRICE-OK');
    expect(ok.status).toBe('CREATED');

    const product = await productRepo.findOne({ where: { code: 'CONS-PRICE-OK' } });
    expect(product?.priceCents).toBe(1999);
  });

  it('A13 申请退回「待报价」时，有效报价一并撤回', async () => {
    const requestId = await createRequest('cons-a13');
    await review(requestId);
    await quote(requestId);

    const before = await quoteRepo.find({
      where: { requestId, status: QuoteStatus.ACTIVE },
    });
    expect(before.length).toBe(1);

    await http()
      .put(`/api/v1/admin/customization-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: RequestStatus.PENDING_QUOTE })
      .expect(200);

    const active = await quoteRepo.find({
      where: { requestId, status: QuoteStatus.ACTIVE },
    });
    expect(active.length).toBe(0);

    const all = await quoteRepo.find({ where: { requestId } });
    expect(all.every((row) => row.status === QuoteStatus.WITHDRAWN)).toBe(true);

    // 顾客端不再看到「当前有效报价」
    const mine = await http()
      .get('/api/v1/customization-requests')
      .set('x-customer-token', customerToken)
      .expect(200);
    const item = mine.body.data.items.find((row: { id: string }) => row.id === requestId);
    expect(item.activeQuote).toBeNull();
  });
});
