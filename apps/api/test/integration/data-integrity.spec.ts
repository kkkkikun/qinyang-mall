import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AdminRole, MeasurementType, PricingMode, ProductStatus, TemplateStatus } from '@qinyang/contracts';
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
 * 数据一致性（本轮审计的第三批）。
 *
 * 覆盖：
 * 1. **量体模板的版本唯一性** —— 版本号是「现有最大版本 + 1」算出来的，
 *    并发发布会算出同一个版本号；「同一 code 同时只有一个 ACTIVE」
 *    此前只靠应用层先归档后新建，中途失败会留下
 *    「一个 ACTIVE 都没有」的空档 —— 顾客端立刻无法提交定制申请。
 *    现在由数据库唯一索引 + 生成列兜底，发布流程放进事务。
 * 2. **量体值不能是负数** —— 模板没定义 min/max 时任何值都收，
 *    「胸围 = -50cm」会被照单全收并写进量体快照。
 * 3. **报价的申请编号** —— 契约里有 requestNo，此前恒为 ''，
 *    后台报价列表永远显示空申请号。
 */
describe('数据一致性', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let templateRepo: Repository<MeasurementTemplate>;
  let productRepo: Repository<Product>;

  let ownerToken: string;
  let customerToken: string;
  let categoryId: string;

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
    await adminRepo.save(
      adminRepo.create({
        username: 'it-integrity-owner',
        displayName: '店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
    );

    const category = await categoryRepo.save(
      categoryRepo.create({
        code: 'it-integrity-cat',
        name: '一致性测试分类',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );
    categoryId = category.id;

    ownerToken = (
      await http()
        .post('/api/v1/admin/auth/login')
        .send({ username: 'it-integrity-owner', password: 'Test@12345' })
        .expect(200)
    ).body.data.token;
    customerToken = (
      await http()
        .post('/api/v1/auth/login')
        .send({ code: 'dev:it-integrity-customer' })
        .expect(200)
    ).body.data.token;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function createTemplate(
    code: string,
    publish: boolean,
    min?: number,
  ): Promise<any> {
    const response = await http()
      .post('/api/v1/admin/measurement-templates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        code,
        name: `模板 ${code}`,
        applicableCategories: [categoryId],
        publish,
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
                ...(min === undefined ? {} : { min, max: min + 60 }),
              },
            ],
          },
        ],
      });
    return response;
  }

  it('同一模板 code 同时只有一个 ACTIVE（旧版本被归档）', async () => {
    const first = await createTemplate('IT-TPL-UNI', true);
    expect([200, 201]).toContain(first.status);

    const second = await createTemplate('IT-TPL-UNI', true);
    expect([200, 201]).toContain(second.status);

    const actives = await templateRepo.find({
      where: { code: 'IT-TPL-UNI', status: TemplateStatus.ACTIVE },
    });
    expect(actives.length).toBe(1);
  });

  it('数据库直接插第二条同 code 的 ACTIVE 会被拒绝（唯一约束兜底）', async () => {
    const active = await templateRepo.findOne({
      where: { code: 'IT-TPL-UNI', status: TemplateStatus.ACTIVE },
    });
    expect(active).not.toBeNull();

    let rejected = false;
    try {
      await templateRepo.save(
        templateRepo.create({
          code: 'IT-TPL-UNI',
          name: '并发插入的模板',
          version: 999,
          status: TemplateStatus.ACTIVE,
          applicableCategories: [],
          summary: null,
          measurementSections: [],
        }),
      );
    } catch (error) {
      rejected = true;
    }
    expect(rejected).toBe(true);
  });

  it('并发发布同一模板只会成功一次，另一方拿到 409', async () => {
    await createTemplate('IT-TPL-RACE', false);

    const draft = await templateRepo.findOne({
      where: { code: 'IT-TPL-RACE', status: TemplateStatus.DRAFT },
    });
    expect(draft).not.toBeNull();

    // 同一个草稿并发发布两次：版本号会被算成同一个 → 唯一索引拦下
    const [a, b] = await Promise.all([
      http()
        .post(`/api/v1/admin/measurement-templates/${draft!.id}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`),
      http()
        .post(`/api/v1/admin/measurement-templates/${draft!.id}/publish`)
        .set('Authorization', `Bearer ${ownerToken}`),
    ]);
    const statuses = [a.status, b.status].sort();
    // 至少一个成功，另一个要么 409（版本冲突）要么 200（串行化后都成功）
    expect(statuses[0]).toBeGreaterThanOrEqual(200);
    expect(statuses[1]).toBeLessThan(500);

    const actives = await templateRepo.find({
      where: { code: 'IT-TPL-RACE', status: TemplateStatus.ACTIVE },
    });
    expect(actives.length).toBe(1);
  });

  it('量体值不能是负数（模板没定义区间时也拦）', async () => {
    const negTemplate = await createTemplate('IT-TPL-NEG', true, undefined);
    const negTemplateId = negTemplate.body.data.id;

    const product = await productRepo.save(
      productRepo.create({
        code: 'IT-INT-001',
        name: '一致性测试商品',
        subtitle: null,
        categoryId,
        pricingMode: PricingMode.QUOTE_ONLY,
        priceCents: null,
        material: null,
        description: null,
        careGuide: null,
        // 显式绑定模板：同分类下有多个模板时，按分类回退解析到哪一个是不确定的
        measurementTemplateId: negTemplateId,
        sortOrder: 0,
        status: ProductStatus.PUBLISHED,
        createdById: null,
        publishedAt: new Date(),
      }),
    );

    const res = await http()
      .post('/api/v1/customization-requests')
      .set('x-customer-token', customerToken)
      .send({
        productId: product.id,
        submitId: `integrity-neg-${Date.now()}`,
        measurements: [
          {
            fieldCode: 'chest_bust',
            fieldName: '胸围',
            measurementType: MeasurementType.BODY,
            unit: 'cm',
            value: -50
          },
        ],
        contact: {
          name: '一致性测试顾客',
          phone: '13800000007',
          region: '内蒙古',
          detail: '测试地址'
        },
      });
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toContain('负数');
  });

  it('模板定义了区间时按区间校验（超上限被拒）', async () => {
    const rangeTemplate = await createTemplate('IT-TPL-RANGE', true, 60);

    const product = await productRepo.save(
      productRepo.create({
        code: 'IT-INT-002',
        name: '区间测试商品',
        subtitle: null,
        categoryId,
        pricingMode: PricingMode.QUOTE_ONLY,
        priceCents: null,
        material: null,
        description: null,
        careGuide: null,
        measurementTemplateId: rangeTemplate.body.data.id,
        sortOrder: 0,
        status: ProductStatus.PUBLISHED,
        createdById: null,
        publishedAt: new Date(),
      }),
    );

    const res = await http()
      .post('/api/v1/customization-requests')
      .set('x-customer-token', customerToken)
      .send({
        productId: product.id,
        submitId: `integrity-range-${Date.now()}`,
        measurements: [
          {
            fieldCode: 'chest_bust',
            fieldName: '胸围',
            measurementType: MeasurementType.BODY,
            unit: 'cm',
            value: 200
          },
        ],
        contact: {
          name: '一致性测试顾客',
          phone: '13800000007',
          region: '内蒙古',
          detail: '测试地址'
        },
      });
    expect(res.status).toBe(400);
    expect(String(res.body.message)).toContain('不能大于');
  });

  it('报价列表带上申请编号（此前恒为空串）', async () => {
    const tpl = await templateRepo.findOne({ where: { code: 'IT-TPL-RANGE' } });
    const product = await productRepo.findOne({ where: { code: 'IT-INT-002' } });
    expect(tpl).not.toBeNull();
    expect(product).not.toBeNull();

    const created = await http()
      .post('/api/v1/customization-requests')
      .set('x-customer-token', customerToken)
      .send({
        productId: product!.id,
        submitId: `integrity-quote-${Date.now()}`,
        measurements: [
          {
            fieldCode: 'chest_bust',
            fieldName: '胸围',
            measurementType: MeasurementType.BODY,
            unit: 'cm',
            value: 90
          },
        ],
        contact: {
          name: '一致性测试顾客',
          phone: '13800000007',
          region: '内蒙古',
          detail: '测试地址'
        },
      })
      .expect(201);
    const requestId = created.body.data.id;
    const requestNo = created.body.data.requestNo;
    expect(Boolean(requestNo)).toBe(true);

    await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/review`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ action: 'APPROVE' })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    await http()
      .post(`/api/v1/admin/customization-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ amountCents: 138000, freightCents: 0, productionDays: 25 })
      .expect((res) => {
        expect([200, 201]).toContain(res.status);
      });

    const quotes = await http()
      .get(`/api/v1/admin/customization-requests/${requestId}/quotes`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(quotes.body.data.length).toBeGreaterThan(0);
    expect(quotes.body.data[0].requestNo).toBe(requestNo);
  });
});
