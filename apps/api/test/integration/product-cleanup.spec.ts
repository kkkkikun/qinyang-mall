import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AdminRole, PricingMode, ProductStatus } from '@qinyang/contracts';
import { AppModule } from '../../src/app.module';
import { configureBodyParsers } from '../../src/common/http/body-parser';
import { AdminUser } from '../../src/database/entities/admin-user.entity';
import { AuditLog } from '../../src/database/entities/audit-log.entity';
import { Category } from '../../src/database/entities/category.entity';
import { CustomizationRequest } from '../../src/database/entities/customization-request.entity';
import { Product } from '../../src/database/entities/product.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

/**
 * 商品删除能力。
 *
 * 背景（第十一轮）：
 * 此前商品只有「下架」，没有「删除」——
 * 商家误建或误导入的商品会**永远**躺在商品列表里，
 * 自动化验证脚本每跑一次也会留下一件 `VERIFY-*` 垃圾商品
 * （实测开发库已积累 41 件，商家在工作台里直接可见）。
 *
 * 删除口径（宁可少删，不可错删）：
 * - 已发布（PUBLISHED）不直接删 —— 先下架再删；
 * - 被定制申请引用过的不删 —— 申请 / 报价 / 订单都指向它，删了历史单据就断线。
 */
describe('商品删除', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let productRepo: Repository<Product>;
  let categoryRepo: Repository<Category>;
  let requestRepo: Repository<CustomizationRequest>;
  let auditRepo: Repository<AuditLog>;

  let ownerToken: string;
  let staffToken: string;

  const http = () => request(app.getHttpServer());

  const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';

  async function createProduct(code: string, status: ProductStatus): Promise<string> {
    const saved = await productRepo.save(
      productRepo.create({
        code,
        name: `测试商品 ${code}`,
        subtitle: '',
        categoryId: CATEGORY_ID,
        pricingMode: PricingMode.FIXED_PRICE,
        priceCents: 19900,
        material: '山羊绒',
        description: '',
        careGuide: '',
        measurementTemplateId: null,
        status,
        sortOrder: 0,
        publishedAt: status === ProductStatus.PUBLISHED ? new Date() : null,
      }),
    );
    return saved.id;
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
    productRepo = moduleRef.get<Repository<Product>>(getRepositoryToken(Product));
    categoryRepo = moduleRef.get<Repository<Category>>(getRepositoryToken(Category));
    requestRepo = moduleRef.get<Repository<CustomizationRequest>>(
      getRepositoryToken(CustomizationRequest),
    );
    auditRepo = moduleRef.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));

    await categoryRepo.save(
      categoryRepo.create({
        id: CATEGORY_ID,
        code: 'knitwear-cardigan',
        name: '羊绒衫',
        parentId: null,
        level: 0,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );

    const hash = await bcrypt.hash('Test@12345', 4);
    await adminRepo.save([
      adminRepo.create({
        username: 'it-del-owner',
        displayName: '店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
      adminRepo.create({
        username: 'it-del-staff',
        displayName: '店员',
        passwordHash: hash,
        role: AdminRole.STAFF,
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
    ownerToken = await login('it-del-owner');
    staffToken = await login('it-del-staff');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('店员不能删除商品（删除是店主专属）', async () => {
    const id = await createProduct('DEL-STAFF-1', ProductStatus.DRAFT);
    await http()
      .delete(`/api/v1/admin/products/${id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .expect(403);
    const still = await productRepo.findOne({ where: { id } });
    expect(still).toBeTruthy();
  });

  it('未发布商品可以被店主删除', async () => {
    const id = await createProduct('DEL-DRAFT-1', ProductStatus.DRAFT);
    await http()
      .delete(`/api/v1/admin/products/${id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const gone = await productRepo.findOne({ where: { id } });
    expect(gone).toBeNull();
  });

  it('已发布商品不能直接删除（要求先下架）', async () => {
    const id = await createProduct('DEL-PUB-1', ProductStatus.PUBLISHED);
    const res = await http()
      .delete(`/api/v1/admin/products/${id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
    expect(res.body.message).toContain('下架');
    const still = await productRepo.findOne({ where: { id } });
    expect(still).toBeTruthy();
  });

  it('已被定制申请引用的商品不能删除', async () => {
    const id = await createProduct('DEL-REF-1', ProductStatus.OFFLINE);
    await requestRepo.save(
      requestRepo.create({
        customerId: '22222222-2222-4222-8222-222222222222',
        productId: id,
        productSnapshot: { code: 'DEL-REF-1', name: '测试商品' },
        templateId: '44444444-4444-4444-8444-444444444444',
        templateName: '测试模板',
        templateVersion: 1,
        measurementSnapshot: {},
        contact: { name: '测试顾客', phone: '13800000000' },
        status: 'PENDING_REVIEW' as never,
        requestNo: 'RQ-2026-9999',
        submitId: 'del-ref-submit-1',
        remark: null,
      }),
    );

    const res = await http()
      .delete(`/api/v1/admin/products/${id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(409);
    expect(res.body.message).toContain('定制申请');
    const still = await productRepo.findOne({ where: { id } });
    expect(still).toBeTruthy();
  });

  it('删除不存在的商品返回 404', async () => {
    await http()
      .delete('/api/v1/admin/products/33333333-3333-4333-8333-333333333333')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('删除写审计日志', async () => {
    const id = await createProduct('DEL-AUDIT-1', ProductStatus.DRAFT);
    await http()
      .delete(`/api/v1/admin/products/${id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const rows = await auditRepo.find({ where: { action: 'product.delete' } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].targetType).toBe('product');
  });
});
