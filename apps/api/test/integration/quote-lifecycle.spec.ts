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
import { Product } from '../../src/database/entities/product.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

/**
 * 报价生命周期与死路封堵。
 *
 * 本轮业务审计发现并修复的四条「顾客/店员走到某一步就断了」：
 * 1. 顾客只能确认报价、不能拒绝 —— 嫌贵即死路（需求明确要求「确认或拒绝」）；
 * 2. 顾客已确认的报价仍可被店员撤回 → 顾客侧出现「状态是已确认、
 *    但显示商家尚未报价」的自相矛盾；
 * 3. 顾客点「取消申请」在 3 个状态下必然报错（前端/后端/契约三处口径不一致）；
 * 4. 顾客取消申请不留审计痕迹（需求要求关键操作留痕）。
 */
describe('报价生命周期与死路封堵', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let templateRepo: Repository<MeasurementTemplate>;
  let productRepo: Repository<Product>;

  let ownerToken: string;
  let customerToken: string;
  let categoryId: string;
  let templateId: string;
  let productId: string;

  const http = () => request(app.getHttpServer());

  /** 建一条走到「已报价」的申请，返回 { requestId, quoteId, quoteVersion } */
  async function makeQuotedRequest(submitId: string) {
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
        contact: { name: '王五', phone: '13800000003', region: '内蒙古 呼和浩特', detail: '某街 3 号' },
        submitId,
      })
      .expect(201);
    const requestId = created.body.data.id;
    await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ action: 'APPROVE', note: '通过' })
      .expect(200);
    const quote = await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amountCents: 288000, freightCents: 2000, productionDays: 25 })
      .expect(201);
    return {
      requestId,
      quoteId: quote.body.data.id,
      quoteVersion: quote.body.data.version,
      quoteRaw: quote.body.data,
    };
  }

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
      .send({ code: 'dev:it-quote-life' })
      .expect(200);
    customerToken = cust.body.data.token;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('顾客可以拒绝报价：报价置为已拒绝，申请回到待报价', async () => {
    const { requestId, quoteId, quoteVersion } = await makeQuotedRequest('life-reject-1');

    const res = await http()
      .post(`/api/v1/customization-requests/${requestId}/reject-quote`)
      .set('x-customer-token', customerToken)
      .send({ quoteId, expectedVersion: quoteVersion, reason: '超出预算' })
      .expect(200);
    expect(res.body.data.status).toBe(QuoteStatus.REJECTED);

    const detail = await http()
      .get(`/api/v1/customization-requests/${requestId}`)
      .set('x-customer-token', customerToken)
      .expect(200);
    expect(detail.body.data.status).toBe(RequestStatus.PENDING_QUOTE);
    // 拒绝后不应再有有效报价，顾客端会显示「当前没有可展示的报价」
    expect(detail.body.data.activeQuote ?? null).toBeNull();
  });

  it('拒绝报价留下审计记录', async () => {
    const { requestId, quoteId, quoteVersion } = await makeQuotedRequest('life-reject-2');
    await http()
      .post(`/api/v1/customization-requests/${requestId}/reject-quote`)
      .set('x-customer-token', customerToken)
      .send({ quoteId, expectedVersion: quoteVersion })
      .expect(200);

    const logs = await http()
      .get('/api/v1/admin/audit-logs?action=quote.reject')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(logs.body.data.items.length).toBeGreaterThan(0);
  });

  it('版本不符时拒绝报价会被拒绝（避免误操作旧版本）', async () => {
    const { requestId, quoteId } = await makeQuotedRequest('life-reject-3');
    await http()
      .post(`/api/v1/customization-requests/${requestId}/reject-quote`)
      .set('x-customer-token', customerToken)
      .send({ quoteId, expectedVersion: 99 })
      .expect(409);
  });

  it('顾客已确认的报价不允许店员撤回（避免状态自相矛盾）', async () => {
    const { requestId, quoteId, quoteVersion } = await makeQuotedRequest('life-withdraw-1');
    await http()
      .post(`/api/v1/customization-requests/${requestId}/confirm-quote`)
      .set('x-customer-token', customerToken)
      .send({ quoteId, expectedVersion: quoteVersion })
      .expect(200);

    // 撤回必须被拒绝：否则顾客侧会出现「已确认 + 商家尚未报价」
    // 撤回报价是按报价 id 的接口（POST /admin/quotes/:id/withdraw），OWNER 专属
    await http()
      .post(`/api/v1/admin/quotes/${quoteId}/withdraw`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);

    const detail = await http()
      .get(`/api/v1/customization-requests/${requestId}`)
      .set('x-customer-token', customerToken)
      .expect(200);
    expect(detail.body.data.status).toBe(RequestStatus.CONFIRMED);
    expect(detail.body.data.activeQuote?.id).toBe(quoteId);
  });

  it('顾客取消申请会留下审计记录', async () => {
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
        contact: { name: '赵六', phone: '13800000004', region: '内蒙古 呼和浩特', detail: '某街 4 号' },
        submitId: 'life-cancel-1',
      })
      .expect(201);
    const requestId = created.body.data.id;

    await http()
      .post(`/api/v1/customization-requests/${requestId}/cancel`)
      .set('x-customer-token', customerToken)
      .expect(200);

    const logs = await http()
      .get('/api/v1/admin/audit-logs?action=request.cancel')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(logs.body.data.items.length).toBeGreaterThan(0);
  });

  it('已报价的申请顾客不能自行取消（与后端白名单一致）', async () => {
    const { requestId } = await makeQuotedRequest('life-cancel-2');
    await http()
      .post(`/api/v1/customization-requests/${requestId}/cancel`)
      .set('x-customer-token', customerToken)
      .expect(409);
  });

  it('同一张图片重复加入图集时更新而不是新增（顾客端不会看到重复图）', async () => {
    const first = await http()
      .post(`/api/v1/admin/products/${productId}/media`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'FRONT', storageKey: 'products/IT-PROD-1/IMG-1-4x5.jpg', url: 'http://x/1.jpg' })
      .expect(201);
    expect(first.body.data.media.length).toBe(1);

    const second = await http()
      .post(`/api/v1/admin/products/${productId}/media`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'COVER', storageKey: 'products/IT-PROD-1/IMG-1-4x5.jpg', url: 'http://x/1.jpg' })
      .expect(201);
    expect(second.body.data.media.length).toBe(1);
    expect(second.body.data.media[0].role).toBe('COVER');
  });
});
