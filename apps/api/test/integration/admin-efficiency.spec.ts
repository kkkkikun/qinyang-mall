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
import { AdminUser } from '../../src/database/entities/admin-user.entity';
import { Category } from '../../src/database/entities/category.entity';
import { MeasurementTemplate } from '../../src/database/entities/measurement-template.entity';
import { Product } from '../../src/database/entities/product.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

/**
 * 后台效率能力：顾客身份可见、按手机号检索、CSV 导出。
 *
 * 背景：此前后台申请列表里**完全看不到顾客**（既没有姓名也没有联系方式），
 * 商家收到一屏申请既分不清是谁，也没法用手机号定位单子 ——
 * 只能逐条点开详情人工比对。CSV 导出则是完全缺失的能力：
 * 商家要把单子交给工厂/财务时，只能截图或手抄。
 */
describe('后台效率能力：顾客身份 / 检索 / 导出', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let templateRepo: Repository<MeasurementTemplate>;
  let productRepo: Repository<Product>;

  let ownerToken: string;
  let customerToken: string;
  let productId: string;
  let templateId: string;
  let categoryId: string;

  const http = () => request(app.getHttpServer());

  const PHONE = '13800001234';

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
        code: 'it-eff',
        name: '效率测试分类',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );
    categoryId = category.id;

    const template = await templateRepo.save(
      templateRepo.create({
        code: 'IT-TPL-EFF',
        name: '效率测试模板',
        version: 1,
        status: TemplateStatus.ACTIVE,
        applicableCategories: ['it-eff'],
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
        code: 'IT-PROD-EFF',
        name: '效率测试商品',
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
      .send({ code: 'dev:it-efficiency' })
      .expect(200);
    customerToken = cust.body.data.token;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  /** 建一件已发布商品（用于批量上下架与图集测试） */
  async function createProduct(code: string): Promise<string> {
    const created = await http()
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        code,
        name: `批量测试商品 ${code}`,
        categoryId,
        pricingMode: PricingMode.QUOTE_ONLY,
        priceCents: null,
        measurementTemplateId: templateId,
      })
      .expect(201);
    return created.body.data.id;
  }

  async function createRequest(name: string, phone: string, remark?: string): Promise<string> {
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
        contact: { name, phone, region: '内蒙古 呼和浩特', detail: '某街 1 号' },
        remark: remark ?? null,
        submitId: `eff-${name}-${phone}`,
      })
      .expect(201);
    return created.body.data.id;
  }

  it('申请列表带出顾客姓名与脱敏手机号', async () => {
    await createRequest('张女士', PHONE);

    const list = await http()
      .get('/api/v1/admin/customization-requests?page=1&pageSize=20')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const row = list.body.data.items.find((item: { customerName: string }) =>
      item.customerName === '张女士',
    );
    expect(row).toBeTruthy();
    expect(row.customerPhoneMasked).toBe('138****1234');
  });

  it('申请列表不泄露完整手机号与量体明细', async () => {
    const list = await http()
      .get('/api/v1/admin/customization-requests?page=1&pageSize=20')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const raw = JSON.stringify(list.body);
    expect(raw).not.toContain(PHONE);
    expect(raw).not.toContain('measurements');
    expect(raw).not.toContain('"contact"');
  });

  it('可以用手机号检索到对应的申请', async () => {
    await createRequest('李先生', '13900005678');

    const list = await http()
      .get(`/api/v1/admin/customization-requests?keyword=${encodeURIComponent('13900005678')}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(list.body.data.total).toBe(1);
    expect(list.body.data.items[0].customerName).toBe('李先生');
  });

  it('可以用顾客姓名检索到对应的申请', async () => {
    const list = await http()
      .get(`/api/v1/admin/customization-requests?keyword=${encodeURIComponent('李先生')}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(list.body.data.total).toBe(1);
  });

  it('CSV 导出返回 text/csv、带 BOM、表头正确', async () => {
    const res = await http()
      .get('/api/v1/admin/customization-requests/export')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text.startsWith('\uFEFF')).toBe(true);
    expect(res.text).toContain('申请编号');
    expect(res.text).toContain('顾客姓名');
    expect(res.text).toContain('手机号（脱敏）');
  });

  it('CSV 导出的内容与当前筛选条件一致，且手机号已脱敏', async () => {
    const res = await http()
      .get(`/api/v1/admin/customization-requests/export?keyword=${encodeURIComponent('李先生')}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const lines = res.text.replace(/^\uFEFF/, '').trim().split(/\r\n|\r|\n/);
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('李先生');
    expect(lines[1]).toContain('139****5678');
    expect(res.text).not.toContain('13900005678');
  });

  it('CSV 导出不会被 :id 路由吃掉（Express 路由顺序）', async () => {
    // 如果 export 声明在 :id 之后，这里会返回「申请不存在」的 404
    const res = await http()
      .get('/api/v1/admin/customization-requests/export')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.text).toContain('申请编号');
  });

  it('导出接口需要登录', async () => {
    await http().get('/api/v1/admin/customization-requests/export').expect(401);
  });

  it('批量上下架：一次调用处理多件，且逐条返回失败原因', async () => {
    const a = await createProduct('IT-BATCH-A');
    const b = await createProduct('IT-BATCH-B');
    const missing = '00000000-0000-4000-8000-000000000000';

    // 草稿 → 待审核 → 已发布：状态机要求分两步，批量操作同样遵守
    const review = await http()
      .post('/api/v1/admin/products/batch-status')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [a, b, missing], status: ProductStatus.PENDING_REVIEW })
      .expect(200);
    expect(review.body.data.updated).toBe(2);
    expect(review.body.data.skipped.length).toBe(1);
    expect(review.body.data.skipped[0].id).toBe(missing);
    expect(review.body.data.skipped[0].reason).toBeTruthy();

    const publish = await http()
      .post('/api/v1/admin/products/batch-status')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [a, b], status: ProductStatus.PUBLISHED })
      .expect(200);
    expect(publish.body.data.updated).toBe(2);
    expect(publish.body.data.skipped.length).toBe(0);

    // 已是已发布的商品再上架属于同状态，允许（幂等）
    const again = await http()
      .post('/api/v1/admin/products/batch-status')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [a], status: ProductStatus.PUBLISHED })
      .expect(200);
    expect(again.body.data.updated).toBe(1);
  });

  it('批量上下架遵守状态机：草稿不能直接上架（逐条给出原因）', async () => {
    const a = await createProduct('IT-BATCH-C');
    const res = await http()
      .post('/api/v1/admin/products/batch-status')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ ids: [a], status: ProductStatus.PUBLISHED })
      .expect(200);
    expect(res.body.data.updated).toBe(0);
    expect(res.body.data.skipped.length).toBe(1);
    expect(res.body.data.skipped[0].reason).toContain('不允许');
  });

  it('图集条目可以就地调整排序', async () => {
    const product = await createProduct('IT-MEDIA-1');
    const first = await http()
      .post(`/api/v1/admin/products/${product}/media`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'DETAIL', storageKey: 'products/IT-MEDIA-1/A.jpg', url: 'http://x/a.jpg', sortOrder: 0 })
      .expect(201);
    const second = await http()
      .post(`/api/v1/admin/products/${product}/media`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'DETAIL', storageKey: 'products/IT-MEDIA-1/B.jpg', url: 'http://x/b.jpg', sortOrder: 1 })
      .expect(201);

    const firstId = first.body.data.media.find(
      (item: { storageKey: string }) => item.storageKey.endsWith('A.jpg'),
    )?.id;
    const secondId = second.body.data.media.find(
      (item: { storageKey: string }) => item.storageKey.endsWith('B.jpg'),
    )?.id;
    expect(firstId).toBeTruthy();

    // 把第二张的排序值改成 0 —— 后台「上移」按钮走的就是这条路径
    const updated = await http()
      .put(`/api/v1/admin/products/${product}/media/${secondId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ sortOrder: 0 })
      .expect(200);

    const item = updated.body.data.media.find((m: { id: string }) => m.id === secondId);
    expect(item.sortOrder).toBe(0);
  });

  it('订单导出接口同样可用', async () => {
    const res = await http()
      .get('/api/v1/admin/orders/export')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('订单编号');
    expect(res.text).toContain('合计（元）');
  });
});
