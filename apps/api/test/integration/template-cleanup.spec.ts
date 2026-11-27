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
import { AuditLog } from '../../src/database/entities/audit-log.entity';
import { Category } from '../../src/database/entities/category.entity';
import { MeasurementTemplate } from '../../src/database/entities/measurement-template.entity';
import { Product } from '../../src/database/entities/product.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

/**
 * 量体模板的删除能力。
 *
 * 背景：
 * 后台此前**没有**删除模板的入口 —— 商家建错了模板只能留着，
 * 量体模板列表里会一直挂着这些垃圾（自动化验证脚本的残留模板就是这么攒下来的）。
 *
 * 语义：
 * - DRAFT / ARCHIVED / ACTIVE 都允许删（商家可能建错并已发布，此时没有别的入口能清掉）；
 * - **被商品引用时不能删** —— 删掉后商品解析不到量体模板，
 *   顾客端提交定制申请会被服务端拒收，等于把模板问题变成订单问题；
 * - 删除必须留审计（`template.delete`）。
 */
describe('量体模板清理', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let templateRepo: Repository<MeasurementTemplate>;
  let productRepo: Repository<Product>;
  let auditRepo: Repository<AuditLog>;

  let ownerToken: string;
  let staffToken: string;
  let categoryId: string;

  const http = () => request(app.getHttpServer());

  /** 建一份可用的模板（默认草稿） */
  async function createTemplate(
    code: string,
    status: TemplateStatus = TemplateStatus.DRAFT,
  ): Promise<MeasurementTemplate> {
    return templateRepo.save(
      templateRepo.create({
        code,
        name: `清理测试模板 ${code}`,
        version: 1,
        status,
        applicableCategories: ['it-cleanup'],
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
    // 与生产环境共用同一份请求体上限（JSON 4MB），避免测试通过、线上 413

    configureBodyParsers(app);

    await app.init();

    dataSource = moduleRef.get(DataSource);
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
    auditRepo = moduleRef.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));

    const hash = await bcrypt.hash('Test@12345', 4);
    await adminRepo.save(
      adminRepo.create({
        username: 'it-cleanup-owner',
        displayName: '店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
    );
    await adminRepo.save(
      adminRepo.create({
        username: 'it-cleanup-staff',
        displayName: '店员',
        passwordHash: hash,
        role: AdminRole.STAFF,
        status: 'ACTIVE' as never,
      }),
    );

    const category = await categoryRepo.save(
      categoryRepo.create({
        code: 'it-cleanup',
        name: '清理测试分类',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );
    categoryId = category.id;

    const owner = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-cleanup-owner', password: 'Test@12345' })
      .expect(200);
    ownerToken = owner.body.data.token;

    const staff = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-cleanup-staff', password: 'Test@12345' })
      .expect(200);
    staffToken = staff.body.data.token;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('删除草稿模板：成功，随后详情 404、列表里也没有它', async () => {
    const template = await createTemplate('IT-TPL-CLEANUP-DRAFT');

    const res = await http()
      .delete(`/api/v1/admin/measurement-templates/${template.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    // 控制器用 200/204 表达成功，这里只断言「成功」
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);

    const detail = await http()
      .get(`/api/v1/admin/measurement-templates/${template.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
    expect(detail.body.code).toBe('NOT_FOUND');

    const list = await http()
      .get('/api/v1/admin/measurement-templates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(list.body.data.map((row: { id: string }) => row.id)).not.toContain(template.id);

    const row = await templateRepo.findOne({ where: { id: template.id } });
    expect(row).toBeNull();
  });

  it('删除被商品引用的模板：409，商品与模板都还在', async () => {
    const template = await createTemplate('IT-TPL-CLEANUP-USED', TemplateStatus.ACTIVE);
    const product = await productRepo.save(
      productRepo.create({
        code: 'IT-PROD-CLEANUP',
        name: '引用模板的商品',
        categoryId,
        measurementTemplateId: template.id,
        pricingMode: PricingMode.QUOTE_ONLY,
        priceCents: null,
        status: ProductStatus.PUBLISHED,
        sortOrder: 0,
        createdById: null,
      }),
    );

    const res = await http()
      .delete(`/api/v1/admin/measurement-templates/${template.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
    expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
    expect(res.body.message).toContain('不能删除');

    // 模板没被删
    const stillThere = await templateRepo.findOne({ where: { id: template.id } });
    expect(stillThere).toBeTruthy();
    // 商品也没被动
    const productStill = await productRepo.findOne({ where: { id: product.id } });
    expect(productStill).toBeTruthy();
    expect(productStill?.measurementTemplateId).toBe(template.id);
  });

  it('删除不存在的模板：404', async () => {
    const res = await http()
      .delete('/api/v1/admin/measurement-templates/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('店员不能删模板：403，且模板仍在', async () => {
    const template = await createTemplate('IT-TPL-CLEANUP-STAFF');

    const res = await http()
      .delete(`/api/v1/admin/measurement-templates/${template.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);

    const stillThere = await templateRepo.findOne({ where: { id: template.id } });
    expect(stillThere).toBeTruthy();
  });

  it('删除写审计：audit_logs 里有 template.delete，before 含模板 code', async () => {
    const template = await createTemplate('IT-TPL-CLEANUP-AUDIT');

    const res = await http()
      .delete(`/api/v1/admin/measurement-templates/${template.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);

    const logs = await auditRepo.find({ where: { action: 'template.delete' } });
    const log = logs.find((row) => row.targetId === template.id);
    expect(log).toBeTruthy();
    expect(log?.targetType).toBe('measurement_template');
    expect(log?.before?.code).toBe('IT-TPL-CLEANUP-AUDIT');
    expect(log?.before?.status).toBe(TemplateStatus.DRAFT);
  });
});
