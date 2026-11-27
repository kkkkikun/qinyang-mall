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

/**
 * 列表载荷与入口护栏集成测试。
 *
 * 覆盖本轮（性能 + 安全）修复：
 * 1. 申请/订单**列表**不再批量带出量体明细与联系方式（体积与隐私双收）；
 * 2. 订单列表补齐真实的来源申请号（此前恒为空字符串）；
 * 3. 分页参数改为 class DTO 后，非法值直接 400，不会退化成全表返回；
 * 4. 店员不能通过「新增商品」夹带 status 绕过店主专属的上下架；
 * 5. 多余字段直接 400，不再静默剥离（契约漂移要能被发现）；
 * 6. submitId 幂等：重复提交返回同一条申请。
 */
describe('列表载荷与入口护栏', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let templateRepo: Repository<MeasurementTemplate>;
  let productRepo: Repository<Product>;

  let ownerToken: string;
  let staffToken: string;
  let customerToken: string;
  let categoryId: string;
  let templateId: string;
  let productId: string;
  let requestId: string;
  let orderId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    // 与生产一致：多余字段直接报错，不静默剥离
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

    const staff = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-staff', password: 'Test@12345' })
      .expect(200);
    staffToken = staff.body.data.token;

    const product = await productRepo.save(
      productRepo.create({
        code: 'IT-PROD-1',
        name: '集成测试羊绒衫',
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
      .send({ code: 'dev:it-guard' })
      .expect(200);
    customerToken = cust.body.data.token;

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
        contact: { name: '张三', phone: '13800000000', region: '内蒙古 呼和浩特', detail: '某街 1 号' },
        submitId: 'it-guard-submit-1',
      })
      .expect(201);
    requestId = created.body.data.id;

    await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ action: 'APPROVE', note: '通过' })
      .expect(200);

    const quote = await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amountCents: 128800, freightCents: 0, productionDays: 21, note: 'it' })
      .expect(201);

    await http()
      .post(`/api/v1/customization-requests/${requestId}/confirm-quote`)
      .set('x-customer-token', customerToken)
      .send({ quoteId: quote.body.data.id, expectedVersion: quote.body.data.version })
      .expect(200);

    const order = await http()
      .post('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ requestId, quoteId: quote.body.data.id })
      .expect(201);
    orderId = order.body.data.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ───────────────────── 列表载荷 ─────────────────────

  it('后台申请列表：不含量体明细与联系方式', async () => {
    const res = await http()
      .get('/api/v1/admin/customization-requests')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const item = res.body.data.items[0];
    expect(item).toBeDefined();
    expect(item.measurements).toBeUndefined();
    expect(item.contact).toBeUndefined();
    expect(item.requestNo).toBeTruthy();
  });

  it('后台申请列表：有效报价是精简版（不含商品与量体快照）', async () => {
    const res = await http()
      .get('/api/v1/admin/customization-requests')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const item = res.body.data.items[0];
    expect(item.activeQuote).toBeTruthy();
    expect(item.activeQuote.totalCents).toBe(128800);
    expect(item.activeQuote.productSnapshot).toBeUndefined();
    expect(item.activeQuote.measurementSnapshot).toBeUndefined();
  });

  it('后台申请详情：仍然带量体明细与联系方式（详情才给）', async () => {
    const res = await http()
      .get(`/api/v1/admin/customization-requests/${requestId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.data.measurements).toBeDefined();
    expect(res.body.data.contact).toBeDefined();
    expect(res.body.data.contact.phone).toBe('13800000000');
  });

  it('顾客自己的申请列表同样不含量体明细与联系方式', async () => {
    const res = await http()
      .get('/api/v1/customization-requests')
      .set('x-customer-token', customerToken)
      .expect(200);
    const item = res.body.data.items[0];
    expect(item).toBeDefined();
    expect(item.measurements).toBeUndefined();
    expect(item.contact).toBeUndefined();
  });

  it('后台订单列表：不含量体快照、联系方式与事件流', async () => {
    const res = await http()
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const item = res.body.data.items[0];
    expect(item).toBeDefined();
    expect(item.measurementSnapshot).toBeUndefined();
    expect(item.contact).toBeUndefined();
    expect(item.events).toBeUndefined();
    expect(item.productSnapshot.media).toBeUndefined();
    expect(typeof item.productSnapshot.mediaCount).toBe('number');
  });

  it('后台订单列表：来源申请号不再是空字符串', async () => {
    const res = await http()
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const item = res.body.data.items[0];
    expect(item.requestNo).toBeTruthy();
    expect(item.requestNo).not.toBe('');
  });

  it('后台订单列表：商品快照带得上商品名（后台「商品」列不再是空的）', async () => {
    const res = await http()
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.data.items[0].productSnapshot.name).toBe('集成测试羊绒衫');
  });

  it('顾客订单列表：来源申请号与商品名都在', async () => {
    const res = await http()
      .get('/api/v1/orders')
      .set('x-customer-token', customerToken)
      .expect(200);
    const item = res.body.data.items[0];
    expect(item.requestNo).toBeTruthy();
    expect(item.productSnapshot.name).toBe('集成测试羊绒衫');
    expect(item.measurementSnapshot).toBeUndefined();
  });

  it('订单详情：量体快照、联系方式与事件流都还在', async () => {
    const res = await http()
      .get(`/api/v1/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body.data.measurementSnapshot).toBeDefined();
    expect(res.body.data.contact).toBeDefined();
    expect(Array.isArray(res.body.data.events)).toBe(true);
    expect(res.body.data.requestNo).toBeTruthy();
  });

  // ───────────────────── 分页护栏 ─────────────────────

  it('分页参数非法值直接 400（不静默退化成全表返回）', async () => {
    await http()
      .get('/api/v1/admin/customization-requests?page=abc')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
    await http()
      .get('/api/v1/admin/orders?pageSize=99999')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
    await http()
      .get('/api/v1/admin/audit-logs?page=0')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
  });

  it('分页参数合法时正常返回', async () => {
    await http()
      .get('/api/v1/admin/customization-requests?page=1&pageSize=10')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
  });

  // ───────────────────── 权限与契约护栏 ─────────────────────

  it('店员新增商品夹带 status 被拒（不能绕过店主专属的上下架）', async () => {
    const res = await http()
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        code: 'IT-STAFF-PRODUCT',
        name: '店员夹带上架的商品',
        categoryId,
        pricingMode: PricingMode.QUOTE_ONLY,
        priceCents: null,
        status: ProductStatus.PUBLISHED,
      });
    expect(res.status).toBe(400);
    const list = await http()
      .get('/api/v1/admin/products?keyword=IT-STAFF-PRODUCT')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(list.body.data.items).toHaveLength(0);
  });

  it('店员正常新增商品成功，且初始状态恒为草稿', async () => {
    const res = await http()
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        code: 'IT-STAFF-PRODUCT-OK',
        name: '店员正常新增的商品',
        categoryId,
        pricingMode: PricingMode.QUOTE_ONLY,
        priceCents: null,
      })
      .expect(201);
    expect(res.body.data.status).toBe(ProductStatus.DRAFT);
    expect(res.body.data.priceCents).toBeNull();
  });

  it('请求里多余的字段直接 400（契约漂移要能被发现）', async () => {
    await http()
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        code: 'IT-EXTRA-FIELD',
        name: '多余字段',
        categoryId,
        pricingMode: PricingMode.QUOTE_ONLY,
        priceCents: null,
        unexpectedField: 'x',
      })
      .expect(400);
  });

  it('submitId 幂等：重复提交返回同一条申请而不是报错', async () => {
    const payload = {
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
      contact: { name: '李四', phone: '13800000001', region: '内蒙古 呼和浩特', detail: '某街 2 号' },
      submitId: 'it-guard-submit-idempotent',
    };
    const first = await http()
      .post('/api/v1/customization-requests')
      .set('x-customer-token', customerToken)
      .send(payload)
      .expect(201);
    const second = await http()
      .post('/api/v1/customization-requests')
      .set('x-customer-token', customerToken)
      .send(payload)
      .expect(201);
    expect(second.body.data.id).toBe(first.body.data.id);
  });
});
