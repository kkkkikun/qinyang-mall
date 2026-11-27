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
 * 量体模板「解析同源 + 形状归一化」集成测试。
 *
 * 这组用例守的是两个真实缺陷：
 *
 * 1. **形状不一致**：原型数据是 snake_case（section_id / measurement_fields /
 *    field_code），契约要求 camelCase。种子曾把原型 JSON 原样入库，
 *    接口于是返回 measurementFields=undefined ——
 *    顾客端量体表单渲染出 0 个字段、提交的量体资料也是空的，
 *    而服务端校验因为看不见字段，等于没校验。
 *
 * 2. **解析与校验不同源**：解析接口按**分类**取模板，
 *    提交校验却按商品**绑定**的模板。顾客按 A 模板填表，
 *    却被按 B 模板判定为「不属于该商品的量体模板」而拒收。
 */
describe('量体模板解析一致性', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let templateRepo: Repository<MeasurementTemplate>;
  let productRepo: Repository<Product>;

  let ownerToken: string;
  let categoryId: string;
  let boundTemplateId: string;
  let productId: string;

  const http = () => request(app.getHttpServer());

  /** 写入一个 camelCase 模板（契约形状） */
  const makeTemplate = async (
    code: string,
    applicableCategories: string[],
    fields: Array<{ fieldCode: string; required?: boolean }>
  ): Promise<MeasurementTemplate> =>
    templateRepo.save(
      templateRepo.create({
        code,
        name: `模板 ${code}`,
        version: 1,
        status: TemplateStatus.ACTIVE,
        applicableCategories,
        summary: '集成测试',
        measurementSections: [
          {
            sectionId: 'body',
            title: '身体测量',
            measurementType: MeasurementType.BODY,
            measurementFields: fields.map((field) => ({
              fieldCode: field.fieldCode,
              fieldName: field.fieldCode,
              measurementType: MeasurementType.BODY,
              unit: 'cm',
              required: field.required ?? true,
              min: 10,
              max: 200,
              step: 0.5,
            })),
          },
        ] as never,
      }),
    );

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
        username: 'it-mt-owner',
        displayName: '店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
    );

    const category = await categoryRepo.save(
      categoryRepo.create({
        code: 'it-outerwear',
        name: '外穿服饰',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );
    categoryId = category.id;

    // 分类能命中「按分类解析」的模板
    await makeTemplate('IT-CATEGORY-TPL', ['it-outerwear'], [
      { fieldCode: 'category_field' },
    ]);
    // 商品绑定的模板：分类命中不了它
    const bound = await makeTemplate('IT-BOUND-TPL', [], [{ fieldCode: 'bound_field' }]);
    boundTemplateId = bound.id;

    const product: Product = await productRepo.save(
      productRepo.create({
        code: 'IT-MT-0001',
        name: '集成测试外穿（临时命名·待确认）',
        categoryId,
        pricingMode: PricingMode.QUOTE_ONLY,
        priceCents: null,
        material: null,
        description: null,
        careGuide: null,
        measurementTemplateId: boundTemplateId,
        sortOrder: 0,
        status: ProductStatus.PUBLISHED,
      }),
    );
    productId = product.id;

    const login = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-mt-owner', password: 'Test@12345' })
      .expect(200);
    ownerToken = login.body.data.token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('解析接口返回的是商品绑定的模板（与提交校验同源），不是按分类命中的那个', async () => {
    const res = await http()
      .get(`/api/v1/measurement-templates/resolve?productId=${productId}`)
      .expect(200);

    expect(res.body.data.templateCode).toBe('IT-BOUND-TPL');
    expect(res.body.data.code).toBe('IT-BOUND-TPL');
  });

  it('解析结果带得出可填字段与必填标记（camelCase 契约形状）', async () => {
    const res = await http()
      .get(`/api/v1/measurement-templates/resolve?productId=${productId}`)
      .expect(200);

    const sections = res.body.data.measurementSections;
    expect(Array.isArray(sections)).toBe(true);
    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0].sectionId).toBe('body');
    expect(sections[0].measurementType).toBe(MeasurementType.BODY);
    expect(sections[0].measurementFields.length).toBe(1);
    expect(sections[0].measurementFields[0].fieldCode).toBe('bound_field');
    expect(sections[0].measurementFields[0].required).toBe(true);
    expect(sections[0].measurementFields[0].unit).toBe('cm');
  });

  it('历史 snake_case 数据也会被归一化成 camelCase 返回', async () => {
    const legacy: MeasurementTemplate = await templateRepo.save(
      templateRepo.create({
        code: 'IT-LEGACY-TPL',
        name: '历史形状模板',
        version: 1,
        status: TemplateStatus.ACTIVE,
        applicableCategories: [],
        summary: 'snake_case 形状',
        // 模拟早期种子写入的原型形状
        measurementSections: [
          {
            section_id: 'body',
            title: '身体测量',
            measurement_type: 'body',
            measurement_fields: [
              {
                field_code: 'legacy_field',
                field_name: '历史字段',
                measurement_type: 'body',
                unit: 'cm',
                required: true,
                min: 5,
                max: 50,
                step: 0.5,
              },
            ],
          },
        ] as never,
      }),
    );

    const detail = await http()
      .get(`/api/v1/admin/measurement-templates/${legacy.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const found = detail.body.data;
    expect(found.measurementSections[0].sectionId).toBe('body');
    expect(found.measurementSections[0].measurementType).toBe(MeasurementType.BODY);
    expect(found.measurementSections[0].measurementFields[0].fieldCode).toBe('legacy_field');
    expect(found.measurementSections[0].measurementFields[0].fieldName).toBe('历史字段');
    expect(found.measurementSections[0].measurementFields[0].required).toBe(true);
  });

  it('按绑定模板的字段提交量体可以通过', async () => {
    const customer = await http()
      .post('/api/v1/auth/login')
      .send({ code: 'dev:it-mt-customer-1' })
      .expect(200);

    const res = await http()
      .post('/api/v1/customization-requests')
      .set('x-customer-token', customer.body.data.token)
      .send({
        productId,
        measurements: [
          {
            fieldCode: 'bound_field',
            fieldName: 'bound_field',
            measurementType: MeasurementType.BODY,
            unit: 'cm',
            value: 88,
          },
        ],
        contact: {
          name: '集成测试顾客（虚构）',
          phone: '13800000003',
          region: '内蒙古自治区 呼和浩特市',
          detail: '集成测试虚构地址',
        },
        remark: null,
        submitId: 'it-mt-submit-1',
      })
      .expect(201);

    expect(res.body.data.status).toBe('PENDING_REVIEW');
    // 快照必须真的带上量体数值
    expect(res.body.data.measurements.fields.length).toBe(1);
    expect(res.body.data.measurements.fields[0].value).toBe(88);
    expect(res.body.data.measurements.templateCode).toBe('IT-BOUND-TPL');
  });

  it('按另一个模板的字段提交会被服务端拒绝（校验与表单同源）', async () => {
    const customer = await http()
      .post('/api/v1/auth/login')
      .send({ code: 'dev:it-mt-customer-2' })
      .expect(200);

    const res = await http()
      .post('/api/v1/customization-requests')
      .set('x-customer-token', customer.body.data.token)
      .send({
        productId,
        measurements: [
          {
            fieldCode: 'category_field',
            fieldName: 'category_field',
            measurementType: MeasurementType.BODY,
            unit: 'cm',
            value: 88,
          },
        ],
        contact: {
          name: '集成测试顾客（虚构）',
          phone: '13800000004',
          region: '内蒙古自治区 呼和浩特市',
          detail: '集成测试虚构地址',
        },
        remark: null,
        submitId: 'it-mt-submit-2',
      })
      .expect(400);

    expect(res.body.code).toBe('MEASUREMENT_INVALID');
  });

  it('必填量体项缺失会被服务端拒绝', async () => {
    const customer = await http()
      .post('/api/v1/auth/login')
      .send({ code: 'dev:it-mt-customer-3' })
      .expect(200);

    const res = await http()
      .post('/api/v1/customization-requests')
      .set('x-customer-token', customer.body.data.token)
      .send({
        productId,
        measurements: [],
        contact: {
          name: '集成测试顾客（虚构）',
          phone: '13800000005',
          region: '内蒙古自治区 呼和浩特市',
          detail: '集成测试虚构地址',
        },
        remark: null,
        submitId: 'it-mt-submit-3',
      })
      .expect(400);

    expect(res.body.code).toBe('MEASUREMENT_INVALID');
  });
});
