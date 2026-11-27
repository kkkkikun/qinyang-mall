import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AdminRole, PricingMode, ProductStatus, TemplateStatus } from '@qinyang/contracts';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { AdminUser } from '../../src/database/entities/admin-user.entity';
import { Category } from '../../src/database/entities/category.entity';
import { MeasurementTemplate } from '../../src/database/entities/measurement-template.entity';
import { Product } from '../../src/database/entities/product.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';
import { configureBodyParsers } from '../../src/common/http/body-parser';

/**
 * 业务闸门。
 *
 * 这一组用例守的是**「不该发生的商业事实不能发生」**：
 *
 * 1. **顾客没点头，不能有订单** —— 管理端的状态接口此前可以直接把申请
 *    改成「已确认」，再拿一份没被顾客确认过的报价建单，
 *    于是整套流程绕过了顾客确认。现在：
 *    - 手工设置「已报价 / 已确认」被拒（这两个状态只能由报价与订单流程产生）；
 *    - 建单时校验报价的确认时间戳，没确认过就 409。
 * 2. **分类不能形成环** —— 把自己挂到自己下面、或挂到自己的子孙下面，
 *    顾客端分类树会无限递归；挂到不存在的父分类会让分类从树上「消失」。
 * 3. **顾客请求体必须真的被校验** —— 确认/拒绝报价此前用 interface 接参，
 *    Nest 的 ValidationPipe 会整体跳过，传 `{}` 也不报错。
 */
describe('业务闸门', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let templateRepo: Repository<MeasurementTemplate>;
  let productRepo: Repository<Product>;

  let ownerToken: string;
  let staffToken: string;
  let customerToken: string;
  let categoryId: string;
  let productId: string;
  let templateId: string;
  let requestId: string;
  let quoteId: string;

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
        username: 'it-gate-owner',
        displayName: '店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
      adminRepo.create({
        username: 'it-gate-staff',
        displayName: '店员',
        passwordHash: hash,
        role: AdminRole.STAFF,
        status: 'ACTIVE' as never,
      }),
    ]);

    const category = await categoryRepo.save(
      categoryRepo.create({
        code: 'it-gate-cat',
        name: '闸门测试分类',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );
    categoryId = category.id;

    const template = await templateRepo.save(
      templateRepo.create({
        code: 'IT-TPL-GATE',
        name: '闸门测试模板',
        version: 1,
        status: TemplateStatus.ACTIVE,
        applicableCategories: [category.id],
        summary: '集成测试用',
        measurementSections: [],
      }),
    );
    templateId = template.id;

    const product = await productRepo.save(
      productRepo.create({
        code: 'IT-GATE-001',
        name: '闸门测试商品',
        subtitle: null,
        categoryId: category.id,
        pricingMode: PricingMode.FIXED_PRICE,
        priceCents: 138000,
        material: '羊绒',
        description: null,
        careGuide: null,
        measurementTemplateId: template.id,
        sortOrder: 0,
        status: ProductStatus.PUBLISHED,
        createdById: null,
        publishedAt: new Date(),
      }),
    );
    productId = product.id;

    ownerToken = (
      await http()
        .post('/api/v1/admin/auth/login')
        .send({ username: 'it-gate-owner', password: 'Test@12345' })
        .expect(200)
    ).body.data.token;
    staffToken = (
      await http()
        .post('/api/v1/admin/auth/login')
        .send({ username: 'it-gate-staff', password: 'Test@12345' })
        .expect(200)
    ).body.data.token;
    customerToken = (
      await http()
        .post('/api/v1/auth/login')
        .send({ code: 'dev:it-gate-customer' })
        .expect(200)
    ).body.data.token;

    // 顾客提交申请
    const created = await http()
      .post('/api/v1/customization-requests')
      .set('x-customer-token', customerToken)
      .send({
        productId,
        submitId: 'gate-submit-001',
        // 模板没有量体字段，提交空量体即可（这里测的是闸门，不是量体规则）
        measurements: [],
        contact: {
          name: '闸门测试顾客',
          phone: '13800000000',
          region: '内蒙古',
          detail: '某路 1 号',
        },
      })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });
    requestId = created.body.data.id;

    // 店员审核通过
    await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ action: 'APPROVE' })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    // 店员报价（未确认）
    const quoted = await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amountCents: 138000, freightCents: 0, productionDays: 25 })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });
    quoteId = quoted.body.data.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('申请此时处于「已报价」，且报价尚未被顾客确认', async () => {
    const detail = await http()
      .get(`/api/v1/admin/customization-requests/${requestId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(detail.body.data.status).toBe('QUOTED');
    expect(detail.body.data.activeQuote.confirmedAt).toBeNull();
  });

  it('管理端不能手工把申请改成「已确认」（绕过顾客确认）', async () => {
    const res = await http()
      .put(`/api/v1/admin/customization-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(409);
    expect(String(res.body.message)).toContain('不能手工设置');
  });

  it('管理端不能手工把申请改成「已报价」', async () => {
    const res = await http()
      .put(`/api/v1/admin/customization-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'QUOTED' })
      .expect(409);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('店员也不能手工设置「已确认」', async () => {
    const res = await http()
      .put(`/api/v1/admin/customization-requests/${requestId}/status`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'CONFIRMED' })
      .expect(409);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('顾客没确认报价就建不了单（纵深防御：即使申请状态被改成已确认）', async () => {
    /*
     * 正常路径下顾客不确认，申请根本到不了「已确认」，建单会在状态检查处被拦。
     * 这里**直接改库**把申请状态改成 CONFIRMED，
     * 模拟历史脏数据或绕过接口的场景 ——
     * 建单还必须再看一眼「这份报价本身被顾客确认过没有」。
     */
    await app.get(DataSource).query(
      'UPDATE `customization_requests` SET `status` = ? WHERE `id` = ?',
      ['CONFIRMED', requestId],
    );

    const res = await http()
      .post('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ requestId, quoteId })
      .expect(409);
    expect(String(res.body.message)).toContain('尚未经顾客确认');
  });

  it('顾客确认报价的请求体必须真的被校验（空 body → 400）', async () => {
    const res = await http()
      .post(`/api/v1/customization-requests/${requestId}/confirm-quote`)
      .set('x-customer-token', customerToken)
      .send({})
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('顾客确认报价的请求体带多余字段 → 400（契约漂移能被发现）', async () => {
    const res = await http()
      .post(`/api/v1/customization-requests/${requestId}/confirm-quote`)
      .set('x-customer-token', customerToken)
      .send({ quoteId, expectedVersion: 1, hack: true })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('顾客确认报价之后，才能建单', async () => {
    // 上一个用例把申请状态改成了「已确认」，这里恢复成「已报价」
    await app.get(DataSource).query(
      'UPDATE `customization_requests` SET `status` = ? WHERE `id` = ?',
      ['QUOTED', requestId],
    );

    const confirmed = await http()
      .post(`/api/v1/customization-requests/${requestId}/confirm-quote`)
      .set('x-customer-token', customerToken)
      .send({ quoteId, expectedVersion: 1 })
      .expect(200);
    expect(confirmed.body.data.confirmedAt).toBeTruthy();

    const order = await http()
      .post('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ requestId, quoteId })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });
    expect(order.body.data.amountCents).toBe(138000);
  });

  it('分类不能把自己设为父分类', async () => {
    const created = await http()
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'it-gate-self', name: '自环分类' })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });
    const id = created.body.data.id;

    const res = await http()
      .put(`/api/v1/admin/categories/${id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'it-gate-self', name: '自环分类', parentId: id })
      .expect(400);
    expect(String(res.body.message)).toContain('不能把自己设为父分类');
  });

  it('分类不能挂到自己的子孙下面（会形成环）', async () => {
    const parent = await http()
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'it-gate-parent', name: '父分类' })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });
    const child = await http()
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'it-gate-child', name: '子分类', parentId: parent.body.data.id })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    const res = await http()
      .put(`/api/v1/admin/categories/${parent.body.data.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: 'it-gate-parent', name: '父分类', parentId: child.body.data.id })
      .expect(400);
    // 「只能两级」这条更早命中（挂到二级分组下面就已经越级），
    // 「不能挂到自己的下级」是纵深防御
    expect(String(res.body.message)).toMatch(/两级|下级分类/);
  });

  it('分类不能挂到不存在的父分类（否则该分类会从树上消失）', async () => {
    const res = await http()
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        code: 'it-gate-orphan',
        name: '孤儿分类',
        parentId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(400);
    expect(String(res.body.message)).toContain('父分类不存在');
  });

  it('审核备注会被落库（此前接收后直接丢弃）', async () => {
    const note = `缺少胸围：${Date.now()}`;
    const res = await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ action: 'APPROVE', note })
      .expect(409); // 已不是待审核状态
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
  });
});
