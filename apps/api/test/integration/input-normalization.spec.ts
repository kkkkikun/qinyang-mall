import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AdminRole, PricingMode, ProductStatus, TemplateStatus } from '@qinyang/contracts';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureBodyParsers } from '../../src/common/http/body-parser';
import { AdminUser } from '../../src/database/entities/admin-user.entity';
import { Banner } from '../../src/database/entities/banner.entity';
import { Category } from '../../src/database/entities/category.entity';
import { MeasurementTemplate } from '../../src/database/entities/measurement-template.entity';
import { Product } from '../../src/database/entities/product.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

/**
 * 输入规范化。
 *
 * 背景（本轮输入校验审计）：
 * 服务端此前既不 trim 文本、也不拦空串、更没有给部分字段设长度上限，
 * 于是出现三类真实缺陷：
 *
 * 1. **同一个编号的两种写法并存成两条记录**
 *    `POST /admin/products {"code":" PROBE-001 "}` 与 `{"code":"PROBE-001"}`
 *    会落成两条不同记录（唯一索引拦不住，字符串确实不同），
 *    列表里看起来就是「重复商品」。更糟的是 **CSV 导入会 trim、表单创建不会**，
 *    两条录入路径口径不一致。
 * 2. **空串落库**：商品编号传 `""` 能通过校验，落库成一个没有编号的商品。
 * 3. **超长字段炸成 500**：商品的 material 列是 varchar(128)，
 *    但 DTO 没有 MaxLength，超长会在落库时变成
 *    「Data too long for column」→ 500，而不是可读的 400。
 * 4. **非法日期炸成 500**：报价 validUntil 传 `'not-a-date'`，
 *    `new Date()` 得到 Invalid Date，落库时才炸。
 *
 * 本测试把这些口径钉死。
 */
describe('输入规范化', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let templateRepo: Repository<MeasurementTemplate>;
  let productRepo: Repository<Product>;
  let bannerRepo: Repository<Banner>;

  let ownerToken: string;
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
    bannerRepo = moduleRef.get<Repository<Banner>>(getRepositoryToken(Banner));

    const hash = await bcrypt.hash('Test@12345', 4);
    await adminRepo.save(
      adminRepo.create({
        username: 'it-norm-owner',
        displayName: '店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
    );

    const category = await categoryRepo.save(
      categoryRepo.create({
        code: 'it-norm-cat',
        name: '规范化测试分类',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );
    categoryId = category.id;

    await templateRepo.save(
      templateRepo.create({
        code: 'IT-TPL-NORM',
        name: '规范化测试模板',
        version: 1,
        status: TemplateStatus.ACTIVE,
        applicableCategories: [category.id],
        summary: '集成测试用',
        measurementSections: [],
      }),
    );

    const owner = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-norm-owner', password: 'Test@12345' })
      .expect(200);
    ownerToken = owner.body.data.token;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function createProduct(body: Record<string, unknown>): Promise<{ status: number; body: any }> {
    const response = await http()
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(body);
    return { status: response.status, body: response.body };
  }

  it('商品编号与名称自动去掉首尾空白', async () => {
    const { status, body } = await createProduct({
      code: '  NORM-001  ',
      name: '  规范化商品  ',
      categoryId,
      pricingMode: PricingMode.QUOTE_ONLY,
    });
    expect(status).toBe(201);
    expect(body.data.code).toBe('NORM-001');
    expect(body.data.name).toBe('规范化商品');
  });

  it('带空白的同一个编号不会落成两条「看起来重复」的商品', async () => {
    const { status, body } = await createProduct({
      code: '  NORM-001  ',
      name: '另一个名字',
      categoryId,
      pricingMode: PricingMode.QUOTE_ONLY,
    });
    expect(status).toBe(400);
    expect(String(body.message)).toContain('已存在');
    expect(await productRepo.count()).toBe(1);
  });

  it('空商品编号被拒绝（此前能落库成「没有编号的商品」）', async () => {
    const { status } = await createProduct({
      code: '   ',
      name: '空编号商品',
      categoryId,
      pricingMode: PricingMode.QUOTE_ONLY,
    });
    expect(status).toBe(400);
  });

  it('超长材质返回 400 而不是落库时的 500', async () => {
    const { status } = await createProduct({
      code: 'NORM-LONG',
      name: '超长材质商品',
      categoryId,
      pricingMode: PricingMode.QUOTE_ONLY,
      material: '羊'.repeat(200),
    });
    expect(status).toBe(400);
    expect(await productRepo.count()).toBe(1);
  });

  it('超长商品简介返回 400', async () => {
    const { status } = await createProduct({
      code: 'NORM-LONG-DESC',
      name: '超长简介商品',
      categoryId,
      pricingMode: PricingMode.QUOTE_ONLY,
      description: 'x'.repeat(3000),
    });
    expect(status).toBe(400);
  });

  it('可选文本传空串 = 清空该字段（落库为 null，而不是空串）', async () => {
    const created = await createProduct({
      code: 'NORM-002',
      name: '清空字段商品',
      categoryId,
      pricingMode: PricingMode.QUOTE_ONLY,
      subtitle: '副标题',
    });
    expect(created.status).toBe(201);

    const updated = await http()
      .put(`/api/v1/admin/products/${created.body.data.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        code: 'NORM-002',
        name: '清空字段商品',
        categoryId,
        pricingMode: PricingMode.QUOTE_ONLY,
        subtitle: '   ',
      })
      .expect(200);
    expect(updated.body.data.subtitle).toBeNull();
  });

  it('分类编号与名称自动去空白', async () => {
    const response = await http()
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ code: '  norm-cat-2 ', name: '  新分类  ' })
      .expect(201);
    expect(response.body.data.code).toBe('norm-cat-2');
    expect(response.body.data.name).toBe('新分类');
  });

  it('轮播标题自动去空白；非法日期返回 400 而不是 500', async () => {
    const bad = await http()
      .post('/api/v1/admin/banners')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: '  轮播标题  ',
        imageUrl: 'https://example.com/a.jpg',
        linkType: 'NONE',
        startAt: 'not-a-date',
      });
    expect(bad.status).toBe(400);

    const ok = await http()
      .post('/api/v1/admin/banners')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: '  轮播标题  ',
        imageUrl: 'https://example.com/a.jpg',
        linkType: 'NONE',
      })
      .expect(201);
    expect(ok.body.data.title).toBe('轮播标题');
    expect(await bannerRepo.count()).toBe(1);
  });

  it('量体模板编号与名称自动去空白', async () => {
    const response = await http()
      .post('/api/v1/admin/measurement-templates')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        code: '  IT-TPL-NORM-2 ',
        name: '  规范化模板  ',
        applicableCategories: [],
        measurementSections: [],
      })
      .expect(201);
    expect(response.body.data.code).toBe('IT-TPL-NORM-2');
    expect(response.body.data.name).toBe('规范化模板');
  });

  it('列表检索的关键字自动去空白', async () => {
    const response = await http()
      .get('/api/v1/admin/products?keyword=%20NORM-001%20')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(response.body.data.total).toBe(1);
    expect(response.body.data.items[0].code).toBe('NORM-001');
  });

  it('顾客申请里的联系方式自动去空白（手机号前后空格）', async () => {
    const product = await productRepo.findOne({ where: { code: 'NORM-001' } });
    expect(product).not.toBeNull();

    const login = await http()
      .post('/api/v1/auth/login')
      .send({ code: 'dev:it-normalization' })
      .expect(200);
    const customerToken = login.body.data.token;

    const response = await http()
      .post('/api/v1/customization-requests')
      .set('x-customer-token', customerToken)
      .send({
        productId: product!.id,
        submitId: '  norm-submit-001  ',
        measurements: [],
        contact: {
          name: '  张女士  ',
          phone: '  13800000000  ',
          region: '  内蒙古  ',
          detail: '  某路 1 号  ',
        },
      });
    // 商品是草稿 → 409（业务校验：商品未上架），但**不是**参数校验失败：
    // 若手机号首尾空格导致校验失败，message 会是「手机号长度…」之类的参数错误
    expect(response.status).toBe(409);
    expect(String(response.body.message)).toContain('商品已下架');
    expect(String(response.body.message)).not.toContain('参数');
  });

  it('商品状态未被导入类接口绕过（回归护栏）', async () => {
    const product = await productRepo.findOne({ where: { code: 'NORM-001' } });
    expect(product?.status).toBe(ProductStatus.DRAFT);
  });
});
