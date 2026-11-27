import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import {
  AdminRole,
  MeasurementType,
  PricingMode,
  ProductStatus,
  QuoteStatus,
  RequestStatus,
  TemplateStatus,
} from '@qinyang/contracts';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AdminUser } from '../../src/database/entities/admin-user.entity';
import { Category } from '../../src/database/entities/category.entity';
import { MeasurementTemplate } from '../../src/database/entities/measurement-template.entity';
import { Order } from '../../src/database/entities/order.entity';
import { OrderEvent } from '../../src/database/entities/order-event.entity';
import { Product } from '../../src/database/entities/product.entity';
import { Quote } from '../../src/database/entities/quote.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

/**
 * 并发一致性。
 *
 * 背景（本轮可靠性审计）：
 * 三处「唯一性」此前只靠**应用层先查后写**保证，在并发下必然失效：
 *
 * 1. 一个定制申请只能有一张订单 —— 两个店员同时点「创建订单」会各插一条；
 * 2. 同一申请同时只有一个有效报价 —— 两个店员同时点「创建报价」会各插一条 ACTIVE；
 * 3. 同一申请同一版本号只有一条报价 —— 版本号是「最大版本 +1」，并发下会算出相同值。
 *
 * 现在唯一性下沉到数据库（唯一索引 + 生成列），应用层负责把重复键翻译成 409。
 * 本测试用**真实并发请求**证明：并发下只会成功一次，另一方拿到 409，
 * 且数据库里不会出现重复数据。
 */
describe('并发一致性', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let templateRepo: Repository<MeasurementTemplate>;
  let productRepo: Repository<Product>;
  let orderRepo: Repository<Order>;
  let orderEventRepo: Repository<OrderEvent>;
  let quoteRepo: Repository<Quote>;

  let ownerToken: string;
  let customerToken: string;
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
    orderRepo = moduleRef.get<Repository<Order>>(getRepositoryToken(Order));
    orderEventRepo = moduleRef.get<Repository<OrderEvent>>(getRepositoryToken(OrderEvent));
    quoteRepo = moduleRef.get<Repository<Quote>>(getRepositoryToken(Quote));

    const hash = await bcrypt.hash('Test@12345', 4);
    await adminRepo.save(
      adminRepo.create({
        username: 'it-owner',
        displayName: '店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
    );

    const category = await categoryRepo.save(
      categoryRepo.create({
        code: 'it-conc',
        name: '并发测试分类',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );
    categoryId = category.id;

    const template = await templateRepo.save(
      templateRepo.create({
        code: 'IT-TPL-CONC',
        name: '并发测试模板',
        version: 1,
        status: TemplateStatus.ACTIVE,
        applicableCategories: ['it-conc'],
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
      .send({ username: 'it-owner', password: 'Test@12345' })
      .expect(200);
    ownerToken = owner.body.data.token;

    const product = await productRepo.save(
      productRepo.create({
        code: 'IT-PROD-CONC',
        name: '并发测试商品',
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
      .send({ code: 'dev:it-concurrency' })
      .expect(200);
    customerToken = cust.body.data.token;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

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
        contact: { name: '并发顾客', phone: '13800009999', region: '内蒙古 呼和浩特', detail: '测试' },
        submitId,
      })
      .expect(201);
    return created.body.data.id;
  }

  async function reviewAndQuote(requestId: string, amountCents = 288000): Promise<Quote> {
    await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ action: 'APPROVE', note: '并发测试' })
      .expect(200);
    const res = await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amountCents, freightCents: 2000, productionDays: 25 })
      .expect(201);
    return res.body.data;
  }

  it('并发创建报价：只会成功一次，同一申请不会出现两条有效报价', async () => {
    const requestId = await createRequest('conc-quote-1');
    await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ action: 'APPROVE', note: '并发测试' })
      .expect(200);

    // 两个店员同时点「创建报价」
    const [a, b] = await Promise.all([
      http()
        .post(`/api/v1/admin/customization-requests/${requestId}/quotes`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 288000, freightCents: 2000, productionDays: 25 }),
      http()
        .post(`/api/v1/admin/customization-requests/${requestId}/quotes`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amountCents: 288000, freightCents: 2000, productionDays: 25 }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const quotes = await quoteRepo.find({ where: { requestId } });
    const active = quotes.filter((q) => q.status === QuoteStatus.ACTIVE);
    expect(active.length).toBe(1);
    expect(quotes.length).toBe(1);
  });

  it('并发建单：同一申请只会产生一张订单，另一方拿到 409', async () => {
    const requestId = await createRequest('conc-order-1');
    const quote = await reviewAndQuote(requestId);
    await http()
      .post(`/api/v1/customization-requests/${requestId}/confirm-quote`)
      .set('x-customer-token', customerToken)
      .send({ quoteId: quote.id, expectedVersion: quote.version })
      .expect(200);

    // 两个店员同时点「创建订单」
    const [a, b] = await Promise.all([
      http()
        .post('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ requestId, quoteId: quote.id }),
      http()
        .post('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ requestId, quoteId: quote.id }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const orders = await orderRepo.find({ where: { requestId } });
    expect(orders.length).toBe(1);

    // 订单事件必须与订单同时落库（事务保证）
    const events = await orderEventRepo.find({ where: { orderId: orders[0].id } });
    expect(events.length).toBe(1);
  });

  it('并发顾客确认报价：只会成功一次', async () => {
    const requestId = await createRequest('conc-confirm-1');
    const quote = await reviewAndQuote(requestId);

    const [a, b] = await Promise.all([
      http()
        .post(`/api/v1/customization-requests/${requestId}/confirm-quote`)
        .set('x-customer-token', customerToken)
        .send({ quoteId: quote.id, expectedVersion: quote.version }),
      http()
        .post(`/api/v1/customization-requests/${requestId}/confirm-quote`)
        .set('x-customer-token', customerToken)
        .send({ quoteId: quote.id, expectedVersion: quote.version }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    const detail = await http()
      .get(`/api/v1/customization-requests/${requestId}`)
      .set('x-customer-token', customerToken)
      .expect(200);
    expect(detail.body.data.status).toBe(RequestStatus.CONFIRMED);
  });

  it('数据库层确实存在唯一约束（不是只靠应用层检查）', async () => {
    const dataSource = app.get<DataSource>(DataSource);

    const indexes = await dataSource.query(
      `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'`,
    );
    const uniqueOnRequest = indexes.find(
      (row: { INDEX_NAME: string; NON_UNIQUE: number | string }) =>
        row.INDEX_NAME === 'UQ_orders_requestId' && Number(row.NON_UNIQUE) === 0,
    );
    expect(uniqueOnRequest).toBeTruthy();

    const quoteIndexes = await dataSource.query(
      `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quotes'`,
    );
    expect(
      quoteIndexes.find(
        (row: { INDEX_NAME: string }) => row.INDEX_NAME === 'UQ_quotes_requestId_version',
      ),
    ).toBeTruthy();
    expect(
      quoteIndexes.find(
        (row: { INDEX_NAME: string }) => row.INDEX_NAME === 'UQ_quotes_activeRequestId',
      ),
    ).toBeTruthy();

    // 生成列存在且随状态变化
    const columns = await dataSource.query(
      `SELECT COLUMN_NAME, EXTRA, GENERATION_EXPRESSION FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quotes' AND COLUMN_NAME = 'activeRequestId'`,
    );
    expect(columns.length).toBe(1);
    expect(String(columns[0].EXTRA)).toContain('GENERATED');
  });

  it('直接写库插入第二条 ACTIVE 报价会被数据库拒绝（约束真的生效）', async () => {
    const requestId = await createRequest('conc-db-1');
    await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ action: 'APPROVE', note: '并发测试' })
      .expect(200);
    await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amountCents: 288000, freightCents: 2000, productionDays: 25 })
      .expect(201);

    const dataSource = app.get<DataSource>(DataSource);
    await expect(
      dataSource.query(
        `INSERT INTO \`quotes\`
           (\`id\`, \`requestId\`, \`version\`, \`status\`, \`amountCents\`, \`freightCents\`, \`currency\`,
            \`productionDays\`, \`productSnapshot\`, \`measurementSnapshot\`, \`createdById\`, \`createdByName\`, \`createdAt\`, \`updatedAt\`)
         VALUES (UUID(), ?, 2, 'ACTIVE', 1, 0, 'CNY', 1, '{}', '{}', 'x', 'x', NOW(6), NOW(6))`,
        [requestId],
      ),
    ).rejects.toBeTruthy();
  });
});
