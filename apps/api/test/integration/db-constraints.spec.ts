import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import {
  AdminRole,
  MediaRole,
  MeasurementType,
  PricingMode,
  ProductStatus,
  TemplateStatus,
} from '@qinyang/contracts';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureBodyParsers } from '../../src/common/http/body-parser';
import { AdminUser } from '../../src/database/entities/admin-user.entity';
import { Banner } from '../../src/database/entities/banner.entity';
import { Category } from '../../src/database/entities/category.entity';
import { MeasurementTemplate } from '../../src/database/entities/measurement-template.entity';
import { Product } from '../../src/database/entities/product.entity';
import { ProductMedia } from '../../src/database/entities/product-media.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

/**
 * 数据库层约束（唯一性 + 乐观锁）。
 *
 * 背景（本轮数据库约束下沉）：
 * 1. `product_media` 此前只有 `IDX_product_media_productId` 普通索引，
 *    「追加图集」是先查后写 —— 两个店员同时把同一张图加入同一商品，
 *    会插两条同 storageKey 的行，顾客端图集里同一张图出现两次。
 *    现在唯一性下沉到数据库（唯一索引），重复行由索引裁决。
 * 2. `measurement_templates` / `banners` 此前**没有**版本列，
 *    管理端更新是「先读后写 → save(整行实体)」—— 两个管理员同时编辑时，
 *    后写者用陈旧快照**静默覆盖**先写者，而用户拿到 200 没有任何提示。
 *    现在改为条件更新（`WHERE id = ? AND version = ?`），
 *    版本不匹配 → 409，而不是覆盖。
 *
 * 本测试用**真实并发请求**证明：并发下只有一个写入成功，另一方拿到 409，
 * 且数据库里不会出现重复数据。
 */
describe('数据库层约束', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let templateRepo: Repository<MeasurementTemplate>;
  let productRepo: Repository<Product>;
  let mediaRepo: Repository<ProductMedia>;
  let bannerRepo: Repository<Banner>;

  let ownerToken: string;
  let owner2Token: string;
  let productId: string;
  let categoryId: string;

  const http = () => request(app.getHttpServer());

  /** 量体模板的最小合法载荷（字段与 contracts 的 MeasurementTemplateUpsertRequest 对齐） */
  function templatePayload(name: string) {
    return {
      code: 'IT-TPL-DB',
      name,
      applicableCategories: ['it-db'],
      summary: '数据库约束测试',
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
    };
  }

  /** 轮播的最小合法载荷 */
  function bannerPayload(title: string) {
    return {
      title,
      imageUrl: 'https://example.com/banner.jpg',
      linkType: 'NONE',
      sortOrder: 0,
      status: 'ACTIVE',
    };
  }

  async function createDraftTemplate(code: string): Promise<MeasurementTemplate> {
    return templateRepo.save(
      templateRepo.create({
        code,
        name: '数据库约束测试模板',
        version: 1,
        status: TemplateStatus.DRAFT,
        applicableCategories: ['it-db'],
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
    mediaRepo = moduleRef.get<Repository<ProductMedia>>(getRepositoryToken(ProductMedia));
    bannerRepo = moduleRef.get<Repository<Banner>>(getRepositoryToken(Banner));

    const hash = await bcrypt.hash('Test@12345', 4);
    for (const username of ['it-db-owner', 'it-db-owner-2']) {
      await adminRepo.save(
        adminRepo.create({
          username,
          displayName: username === 'it-db-owner' ? '店主甲' : '店主乙',
          passwordHash: hash,
          role: AdminRole.OWNER,
          status: 'ACTIVE' as never,
        }),
      );
    }

    const category = await categoryRepo.save(
      categoryRepo.create({
        code: 'it-db',
        name: '数据库约束测试分类',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );
    categoryId = category.id;

    const owner = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-db-owner', password: 'Test@12345' })
      .expect(200);
    ownerToken = owner.body.data.token;

    const owner2 = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-db-owner-2', password: 'Test@12345' })
      .expect(200);
    owner2Token = owner2.body.data.token;

    const product = await productRepo.save(
      productRepo.create({
        code: 'IT-PROD-DB',
        name: '数据库约束测试商品',
        categoryId,
        pricingMode: PricingMode.QUOTE_ONLY,
        priceCents: null,
        status: ProductStatus.PUBLISHED,
        sortOrder: 0,
        createdById: owner.body.data.user.id,
      }),
    );
    productId = product.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('数据库层确实存在 product_media 唯一索引（不是只靠应用层检查）', async () => {
    const indexes = await dataSource.query(
      `SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_media'`,
    );

    const uniqueRows = indexes.filter(
      (row: { INDEX_NAME: string }) => row.INDEX_NAME === 'UQ_product_media_productId_storageKey',
    );
    expect(uniqueRows.length).toBe(2);
    expect(uniqueRows.every((row: { NON_UNIQUE: number | string }) => Number(row.NON_UNIQUE) === 0)).toBe(
      true,
    );
    expect(
      uniqueRows.map((row: { COLUMN_NAME: string }) => row.COLUMN_NAME).sort(),
    ).toEqual(['productId', 'storageKey']);
  });

  it('直接写库插入第二条同 (productId, storageKey) 会被数据库拒绝', async () => {
    const storageKey = 'db-constraint/direct.jpg';
    const insert = (id: string) =>
      dataSource.query(
        `INSERT INTO \`product_media\`
           (\`id\`, \`productId\`, \`role\`, \`storageKey\`, \`url\`, \`width\`, \`height\`, \`bytes\`,
            \`sortOrder\`, \`alt\`, \`createdAt\`, \`updatedAt\`)
         VALUES (?, ?, 'DETAIL', ?, 'https://example.com/direct.jpg', 0, 0, 0, 0, NULL, NOW(6), NOW(6))`,
        [id, productId, storageKey],
      );

    await insert('db-constraint-direct-1');
    await expect(insert('db-constraint-direct-2')).rejects.toBeTruthy();

    const rows = await mediaRepo.find({ where: { productId, storageKey } });
    expect(rows.length).toBe(1);

    await mediaRepo.delete({ id: rows[0].id });
  });

  it('并发追加同一张图：图集里只会有一条', async () => {
    const storageKey = 'db-constraint/concurrent.jpg';
    const [a, b] = await Promise.all([
      http()
        .post(`/api/v1/admin/products/${productId}/media`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ role: MediaRole.DETAIL, storageKey, url: 'https://example.com/concurrent.jpg' }),
      http()
        .post(`/api/v1/admin/products/${productId}/media`)
        .set('Authorization', `Bearer ${owner2Token}`)
        .send({ role: MediaRole.DETAIL, storageKey, url: 'https://example.com/concurrent.jpg' }),
    ]);

    // 至少一方成功（另一方可能因唯一索引冲突被拒绝），但库里只能有一条
    expect([a.status, b.status].filter((status) => status >= 200 && status < 300).length).toBeGreaterThanOrEqual(
      1,
    );

    const rows = await mediaRepo.find({ where: { productId, storageKey } });
    expect(rows.length).toBe(1);

    await mediaRepo.delete({ id: rows[0].id });
  });

  it('并发修改同一份草稿模板：一方 200、一方 409（不会静默覆盖）', async () => {
    const template = await createDraftTemplate('IT-TPL-DB-RACE');

    const [a, b] = await Promise.all([
      http()
        .put(`/api/v1/admin/measurement-templates/${template.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(templatePayload('管理员甲改的模板')),
      http()
        .put(`/api/v1/admin/measurement-templates/${template.id}`)
        .set('Authorization', `Bearer ${owner2Token}`)
        .send(templatePayload('管理员乙改的模板')),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);

    // 冲突方拿到的是业务 409，不是 500
    const conflict = a.status === 409 ? a : b;
    expect(conflict.body?.code).toBe('VERSION_CONFLICT');
  });

  it('并发修改同一条轮播：一方 200、一方 409（不会静默覆盖）', async () => {
    const banner = await bannerRepo.save(
      bannerRepo.create({
        title: '并发测试轮播',
        imageUrl: 'https://example.com/banner.jpg',
        storageKey: null,
        linkType: 'NONE',
        linkValue: null,
        sortOrder: 0,
        status: 'ACTIVE',
      }),
    );

    const [a, b] = await Promise.all([
      http()
        .put(`/api/v1/admin/banners/${banner.id}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send(bannerPayload('管理员甲改的轮播')),
      http()
        .put(`/api/v1/admin/banners/${banner.id}`)
        .set('Authorization', `Bearer ${owner2Token}`)
        .send(bannerPayload('管理员乙改的轮播')),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);

    const conflict = a.status === 409 ? a : b;
    expect(conflict.body?.code).toBe('VERSION_CONFLICT');
  });

  it('轮播与模板的行版本列存在、初始为 1，成功更新一次后递增', async () => {
    const columns = await dataSource.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND ((TABLE_NAME = 'banners' AND COLUMN_NAME = 'version')
           OR (TABLE_NAME = 'measurement_templates' AND COLUMN_NAME = 'rowVersion'))`,
    );
    expect(columns.length).toBe(2);

    // 轮播：新建 → version = 1 → 更新一次 → version = 2
    const banner = await bannerRepo.save(
      bannerRepo.create({
        title: '版本测试轮播',
        imageUrl: 'https://example.com/version.jpg',
        storageKey: null,
        linkType: 'NONE',
        linkValue: null,
        sortOrder: 0,
        status: 'ACTIVE',
      }),
    );
    const bannerCreated = await bannerRepo.findOne({ where: { id: banner.id } });
    expect(bannerCreated?.version).toBe(1);

    await http()
      .put(`/api/v1/admin/banners/${banner.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(bannerPayload('版本测试轮播（改）'))
      .expect(200);
    const bannerAfter = await bannerRepo.findOne({ where: { id: banner.id } });
    expect(bannerAfter?.version).toBe(2);

    // 模板：新建 → 行版本 = 1 → 更新一次 → 行版本 = 2
    //      业务 version（发布版本号）不因编辑而变化
    const template = await createDraftTemplate('IT-TPL-DB-VERSION');
    const templateCreated = await templateRepo.findOne({ where: { id: template.id } });
    expect(templateCreated?.rowVersion).toBe(1);
    expect(templateCreated?.version).toBe(1);

    await http()
      .put(`/api/v1/admin/measurement-templates/${template.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(templatePayload('版本测试模板（改）'))
      .expect(200);
    const templateAfter = await templateRepo.findOne({ where: { id: template.id } });
    expect(templateAfter?.rowVersion).toBe(2);
    expect(templateAfter?.version).toBe(1);
  });
});
