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
} from '@qinyang/contracts';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureBodyParsers } from '../../src/common/http/body-parser';
import { AdminUser } from '../../src/database/entities/admin-user.entity';
import { Category } from '../../src/database/entities/category.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

/**
 * 行版本（乐观锁）的**客户端比对**语义。
 *
 * 背景：
 * 服务端四个资源（轮播 / 量体模板 / 商品 / 图文说明页）已经有行版本列，
 * 编辑走的是「条件更新」`UPDATE ... WHERE id = ? AND version = ?`。
 * 但服务端读到的版本是**自己刚读的那一份**，只能挡住「两个请求在同一瞬间重叠」。
 *
 * 挡不住这种情况：
 * 商家 A 打开编辑表单 → 商家 B 改完保存 → A 十分钟后保存，
 * A 用**陈旧的整行内容**把 B 的改动覆盖掉，而 A 拿到的是 200，没有任何提示。
 *
 * 解法（与本仓库已有的报价约定一致）：客户端把「我打开时看到的行版本」一起回传，
 * 服务端比对不一致就返回 409。不回传则退化为现有行为（CSV 导入等路径不受影响）。
 *
 * 本测试覆盖三个资源各自的三个口径：
 * 1. 陈旧版本 → 409，且内容**没有被覆盖**；
 * 2. 当前版本 → 200，内容确实变了；
 * 3. 不带 expectedVersion → 200（向后兼容）。
 */
describe('行版本比对（expectedVersion）', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;

  /** 两名店主：模拟「商家 A」与「商家 B」 */
  let tokenA: string;
  let tokenB: string;
  let categoryId: string;

  const http = () => request(app.getHttpServer());

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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

    const hash = await bcrypt.hash('Test@12345', 4);
    for (const username of ['it-lock-owner-a', 'it-lock-owner-b']) {
      await adminRepo.save(
        adminRepo.create({
          username,
          displayName: username === 'it-lock-owner-a' ? '店主甲' : '店主乙',
          passwordHash: hash,
          role: AdminRole.OWNER,
          status: 'ACTIVE' as never,
        }),
      );
    }

    const category = await categoryRepo.save(
      categoryRepo.create({
        code: 'it-lock',
        name: '行版本测试分类',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );
    categoryId = category.id;

    const a = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-lock-owner-a', password: 'Test@12345' })
      .expect(200);
    tokenA = a.body.data.token;

    const b = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-lock-owner-b', password: 'Test@12345' })
      .expect(200);
    tokenB = b.body.data.token;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  /* ------------------------------ 轮播 ------------------------------ */

  const bannerPayload = (title: string) => ({
    title,
    imageUrl: 'https://example.com/banner.jpg',
    linkType: 'NONE',
    linkValue: null,
    sortOrder: 0,
    status: 'ACTIVE',
  });

  async function createBanner(title = '轮播初始标题'): Promise<{ id: string; version: number }> {
    const res = await http()
      .post('/api/v1/admin/banners')
      .set(auth(tokenA))
      .send(bannerPayload(title))
      .expect(201);
    return { id: res.body.data.id, version: res.body.data.version };
  }

  async function getBanner(id: string): Promise<{ title: string; version: number }> {
    const res = await http()
      .get('/api/v1/admin/banners')
      .set(auth(tokenA))
      .expect(200);
    const row = (res.body.data as Array<{ id: string; title: string; version: number }>).find(
      (item) => item.id === id,
    );
    expect(row).toBeTruthy();
    return row as { title: string; version: number };
  }

  it('轮播：陈旧版本被拒（409），且内容没有被覆盖', async () => {
    const banner = await createBanner();

    // 商家 B 用**当前版本**改掉标题 → 成功，行版本 +1
    const bRes = await http()
      .put(`/api/v1/admin/banners/${banner.id}`)
      .set(auth(tokenB))
      .send({ ...bannerPayload('商家 B 改的标题'), expectedVersion: banner.version })
      .expect(200);
    expect(bRes.body.data.version).toBe(banner.version + 1);

    // 商家 A 拿着**打开时看到的旧版本**保存 → 409
    const aRes = await http()
      .put(`/api/v1/admin/banners/${banner.id}`)
      .set(auth(tokenA))
      .send({ ...bannerPayload('商家 A 改的标题'), expectedVersion: banner.version })
      .expect(409);
    expect(aRes.body.code).toBe('VERSION_CONFLICT');
    expect(aRes.body.message).toContain('已被他人修改');

    // 内容没有被 A 覆盖
    const after = await getBanner(banner.id);
    expect(after.title).toBe('商家 B 改的标题');
    expect(after.version).toBe(banner.version + 1);
  });

  it('轮播：带当前版本可以正常保存（200），内容确实变了', async () => {
    const banner = await createBanner();
    const res = await http()
      .put(`/api/v1/admin/banners/${banner.id}`)
      .set(auth(tokenA))
      .send({ ...bannerPayload('改过的标题'), expectedVersion: banner.version })
      .expect(200);
    expect(res.body.data.title).toBe('改过的标题');
    expect(res.body.data.version).toBe(banner.version + 1);

    const after = await getBanner(banner.id);
    expect(after.title).toBe('改过的标题');
  });

  it('轮播：不传 expectedVersion 仍然能保存（向后兼容）', async () => {
    const banner = await createBanner();
    const res = await http()
      .put(`/api/v1/admin/banners/${banner.id}`)
      .set(auth(tokenA))
      .send(bannerPayload('不校验版本的标题'))
      .expect(200);
    expect(res.body.data.title).toBe('不校验版本的标题');

    const after = await getBanner(banner.id);
    expect(after.title).toBe('不校验版本的标题');
  });

  /* ------------------------------ 量体模板 ------------------------------ */

  const templatePayload = (name: string, code: string) => ({
    code,
    name,
    applicableCategories: [],
    summary: '行版本测试',
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
          },
        ],
      },
    ],
    publish: false,
  });

  /** 模板编码有唯一索引 (code, version)，每个用例用独立编码 */
  let templateSeq = 0;

  async function createTemplate(
    name = '模板初始名称',
  ): Promise<{ id: string; code: string; rowVersion: number; version: number }> {
    templateSeq += 1;
    const code = `IT-TPL-LOCK-${templateSeq}`;
    const res = await http()
      .post('/api/v1/admin/measurement-templates')
      .set(auth(tokenA))
      .send(templatePayload(name, code))
      .expect(201);
    return {
      id: res.body.data.id,
      code,
      rowVersion: res.body.data.rowVersion,
      version: res.body.data.version,
    };
  }

  async function getTemplate(id: string): Promise<{ name: string; rowVersion: number }> {
    const res = await http()
      .get(`/api/v1/admin/measurement-templates/${id}`)
      .set(auth(tokenA))
      .expect(200);
    return { name: res.body.data.name, rowVersion: res.body.data.rowVersion };
  }

  it('量体模板：陈旧版本被拒（409），且内容没有被覆盖', async () => {
    const template = await createTemplate();
    const payload = templatePayload('商家 B 改的模板名', template.code);

    // 商家 B 用**当前行版本**改掉名称 → 成功，行版本 +1
    const bRes = await http()
      .put(`/api/v1/admin/measurement-templates/${template.id}`)
      .set(auth(tokenB))
      .send({ ...payload, expectedVersion: template.rowVersion })
      .expect(200);
    expect(bRes.body.data.rowVersion).toBe(template.rowVersion + 1);
    // 业务版本号（第几个发布版本）不受行版本影响
    expect(bRes.body.data.version).toBe(template.version);

    // 商家 A 拿着**打开时看到的旧行版本**保存 → 409
    const aRes = await http()
      .put(`/api/v1/admin/measurement-templates/${template.id}`)
      .set(auth(tokenA))
      .send({ ...templatePayload('商家 A 改的模板名', template.code), expectedVersion: template.rowVersion })
      .expect(409);
    expect(aRes.body.code).toBe('VERSION_CONFLICT');
    expect(aRes.body.message).toContain('已被他人修改');

    // 内容没有被 A 覆盖
    const after = await getTemplate(template.id);
    expect(after.name).toBe('商家 B 改的模板名');
    expect(after.rowVersion).toBe(template.rowVersion + 1);
  });

  it('量体模板：带当前版本可以正常保存（200），内容确实变了', async () => {
    const template = await createTemplate();
    const res = await http()
      .put(`/api/v1/admin/measurement-templates/${template.id}`)
      .set(auth(tokenA))
      .send({
        ...templatePayload('改过的模板名', template.code),
        expectedVersion: template.rowVersion,
      })
      .expect(200);
    expect(res.body.data.name).toBe('改过的模板名');
    expect(res.body.data.rowVersion).toBe(template.rowVersion + 1);

    const after = await getTemplate(template.id);
    expect(after.name).toBe('改过的模板名');
  });

  it('量体模板：不传 expectedVersion 仍然能保存（向后兼容）', async () => {
    const template = await createTemplate();
    const res = await http()
      .put(`/api/v1/admin/measurement-templates/${template.id}`)
      .set(auth(tokenA))
      .send(templatePayload('不校验版本的模板名', template.code))
      .expect(200);
    expect(res.body.data.name).toBe('不校验版本的模板名');

    const after = await getTemplate(template.id);
    expect(after.name).toBe('不校验版本的模板名');
  });

  /* ------------------------------ 商品 ------------------------------ */

  /*
   * 商品用**草稿**做用例：
   * 已发布商品改价是店主专属闸门（STAFF 409），
   * 会和「版本冲突」这条线缠在一起，测的就不是同一件事了。
   */
  const productPayload = (name: string, code: string) => ({
    code,
    name,
    categoryId,
    pricingMode: PricingMode.QUOTE_ONLY,
  });

  /** 商品编号有唯一索引，每个用例用独立编号 */
  let productSeq = 0;

  async function createProduct(
    name = '商品初始名称',
  ): Promise<{ id: string; code: string; version: number; status: string }> {
    productSeq += 1;
    const code = `IT-PROD-LOCK-${productSeq}`;
    const res = await http()
      .post('/api/v1/admin/products')
      .set(auth(tokenA))
      .send(productPayload(name, code))
      .expect(201);
    return {
      id: res.body.data.id,
      code,
      version: res.body.data.version,
      status: res.body.data.status,
    };
  }

  async function getProduct(id: string): Promise<{ name: string; version: number }> {
    const res = await http()
      .get(`/api/v1/admin/products/${id}`)
      .set(auth(tokenA))
      .expect(200);
    return { name: res.body.data.name, version: res.body.data.version };
  }

  it('商品：陈旧版本被拒（409），且内容没有被覆盖', async () => {
    const product = await createProduct();
    expect(product.status).toBe(ProductStatus.DRAFT);

    // 商家 B 用**当前版本**改掉名称 → 成功，行版本 +1
    const bRes = await http()
      .put(`/api/v1/admin/products/${product.id}`)
      .set(auth(tokenB))
      .send({ ...productPayload('商家 B 改的商品名', product.code), expectedVersion: product.version })
      .expect(200);
    expect(bRes.body.data.version).toBe(product.version + 1);

    // 商家 A 拿着**打开时看到的旧版本**保存 → 409
    const aRes = await http()
      .put(`/api/v1/admin/products/${product.id}`)
      .set(auth(tokenA))
      .send({ ...productPayload('商家 A 改的商品名', product.code), expectedVersion: product.version })
      .expect(409);
    expect(aRes.body.code).toBe('VERSION_CONFLICT');
    expect(aRes.body.message).toContain('已被他人修改');

    // 内容没有被 A 覆盖
    const after = await getProduct(product.id);
    expect(after.name).toBe('商家 B 改的商品名');
    expect(after.version).toBe(product.version + 1);
  });

  it('商品：带当前版本可以正常保存（200），内容确实变了', async () => {
    const product = await createProduct();
    const res = await http()
      .put(`/api/v1/admin/products/${product.id}`)
      .set(auth(tokenA))
      .send({ ...productPayload('改过的商品名', product.code), expectedVersion: product.version })
      .expect(200);
    expect(res.body.data.name).toBe('改过的商品名');
    expect(res.body.data.version).toBe(product.version + 1);

    const after = await getProduct(product.id);
    expect(after.name).toBe('改过的商品名');
  });

  it('商品：不传 expectedVersion 仍然能保存（向后兼容）', async () => {
    const product = await createProduct();
    const res = await http()
      .put(`/api/v1/admin/products/${product.id}`)
      .set(auth(tokenA))
      .send(productPayload('不校验版本的商品名', product.code))
      .expect(200);
    expect(res.body.data.name).toBe('不校验版本的商品名');

    const after = await getProduct(product.id);
    expect(after.name).toBe('不校验版本的商品名');
  });
});
