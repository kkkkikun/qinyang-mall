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
import { parseCsv } from '../../src/common/csv';

/**
 * 商品 CSV 批量导入。
 *
 * 覆盖的口径（都是「导入」最容易出错的地方）：
 * 1. 缺表头 → 400，不落库；
 * 2. 只新增不覆盖：编号已存在 → 跳过，既有商品不被改动；
 * 3. 文件内编号重复 → 该行失败，另一行照常导入；
 * 4. 校验失败行不影响其余行（部分成功）；
 * 5. 导入商品一律 DRAFT（不能绕过店主审核直接上架）；
 * 6. dryRun 只校验不落库；
 * 7. 分类可按 code 或 id 引用；分类不存在 / 停用 → 该行失败；
 * 8. 固定价模式换算为整数分；仅按量体报价却填价格 → 该行失败。
 */
describe('商品 CSV 批量导入', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let categoryRepo: Repository<Category>;
  let templateRepo: Repository<MeasurementTemplate>;
  let productRepo: Repository<Product>;

  let ownerToken: string;
  let staffToken: string;
  let categoryId: string;
  let categoryCode: string;

  const http = () => request(app.getHttpServer());

  const HEADERS = '商品编号,商品名称,分类编号,报价模式,价格(元),材质,副标题,商品简介,洗护说明,量体模板编号,排序';

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
    await adminRepo.save([
      adminRepo.create({
        username: 'it-import-owner',
        displayName: '店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
      adminRepo.create({
        username: 'it-import-staff',
        displayName: '店员',
        passwordHash: hash,
        role: AdminRole.STAFF,
        status: 'ACTIVE' as never,
      }),
    ]);

    const category = await categoryRepo.save(
      categoryRepo.create({
        code: 'it-import-cat',
        name: '导入测试分类',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'ACTIVE' as never,
      }),
    );
    categoryId = category.id;
    categoryCode = category.code;

    await templateRepo.save(
      templateRepo.create({
        code: 'IT-TPL-IMPORT',
        name: '导入测试模板',
        version: 1,
        status: TemplateStatus.ACTIVE,
        applicableCategories: [category.id],
        summary: '集成测试用',
        measurementSections: [],
      }),
    );

    const owner = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-import-owner', password: 'Test@12345' })
      .expect(200);
    ownerToken = owner.body.data.token;

    const staff = await http()
      .post('/api/v1/admin/auth/login')
      .send({ username: 'it-import-staff', password: 'Test@12345' })
      .expect(200);
    staffToken = staff.body.data.token;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  async function importCsv(
    csv: string,
    dryRun?: boolean,
    token = ownerToken,
  ): Promise<{ status: number; body: any }> {
    const response = await http()
      .post('/api/v1/admin/products/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ csv, dryRun: dryRun === true });
    return { status: response.status, body: response.body };
  }

  it('CSV 解析器遵循 RFC 4180：引号内逗号与换行、引号转义', () => {
    const rows = parseCsv('a,b\r\n"含,逗号","含""引号"\r\n"含\n换行",z\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['含,逗号', '含"引号'],
      ['含\n换行', 'z'],
    ]);
  });

  it('缺少必需表头时返回 400，且不落库', async () => {
    const { status, body } = await importCsv('编号,名称\nA,B');
    expect(status).toBe(400);
    expect(String(body.message)).toContain('表头');
    expect(await productRepo.count()).toBe(0);
  });

  it('正常导入：逐行给出 CREATED，商品状态为 DRAFT（不绕过店主审核）', async () => {
    const csv = [
      HEADERS,
      `IMP-001,导入测试商品,${categoryCode},仅按量体报价,,羊绒,,简介,,,0`,
      `IMP-002,固定价商品,${categoryCode},固定价可直售,899.50,山羊绒,,简介,,,1`,
    ].join('\n');

    const { status, body } = await importCsv(csv);
    expect(status).toBe(200);
    expect(body.data.total).toBe(2);
    expect(body.data.created).toBe(2);
    expect(body.data.failed).toBe(0);

    const products = await productRepo.find({ order: { code: 'ASC' } });
    expect(products.map((p) => p.code)).toEqual(['IMP-001', 'IMP-002']);
    // 导入商品一律草稿
    expect(products.every((p) => p.status === ProductStatus.DRAFT)).toBe(true);

    const fixed = products.find((p) => p.code === 'IMP-002');
    expect(fixed?.pricingMode).toBe(PricingMode.FIXED_PRICE);
    // 899.50 元 → 89950 分
    expect(fixed?.priceCents).toBe(89950);

    const quoted = products.find((p) => p.code === 'IMP-001');
    expect(quoted?.priceCents).toBeNull();
  });

  it('只新增不覆盖：编号已存在则跳过，既有商品不被改动', async () => {
    const before = await productRepo.findOne({ where: { code: 'IMP-001' } });
    expect(before).not.toBeNull();
    const originalName = before?.name;

    const csv = [HEADERS, `IMP-001,改过名字的商品,${categoryCode},仅按量体报价,,,,,,,`].join('\n');
    const { status, body } = await importCsv(csv);
    expect(status).toBe(200);
    expect(body.data.created).toBe(0);
    expect(body.data.skipped).toBe(1);
    expect(body.data.rows[0].status).toBe('SKIPPED');

    const after = await productRepo.findOne({ where: { code: 'IMP-001' } });
    expect(after?.name).toBe(originalName);
  });

  it('文件内编号重复：后者失败，前者照常导入', async () => {
    const csv = [
      HEADERS,
      `DUP-001,重复编号A,${categoryCode},仅按量体报价,,,,,,,`,
      `DUP-001,重复编号B,${categoryCode},仅按量体报价,,,,,,,`,
    ].join('\n');

    const { body } = await importCsv(csv);
    expect(body.data.created).toBe(1);
    expect(body.data.failed).toBe(1);
    const failed = body.data.rows.find((r: any) => r.status === 'FAILED');
    expect(failed.row).toBe(3);
    expect(String(failed.reason)).toContain('重复');
  });

  it('单行校验失败不影响其余行（部分成功）', async () => {
    const csv = [
      HEADERS,
      `PART-OK,正常行,${categoryCode},仅按量体报价,,,,,,,`,
      `PART-BAD,缺分类行,,仅按量体报价,,,,,,,`,
      `PART-BAD2,分类不存在,no-such-category,仅按量体报价,,,,,,,`,
      `PART-BAD3,价格模式矛盾,${categoryCode},仅按量体报价,199,,,,,`,
    ].join('\n');

    const { body } = await importCsv(csv);
    expect(body.data.created).toBe(1);
    expect(body.data.failed).toBe(3);

    const reasons = body.data.rows
      .filter((r: any) => r.status === 'FAILED')
      .map((r: any) => String(r.reason));
    expect(reasons.some((r: string) => r.includes('分类编号'))).toBe(true);
    expect(reasons.some((r: string) => r.includes('不存在'))).toBe(true);
    expect(reasons.some((r: string) => r.includes('价格'))).toBe(true);
  });

  it('分类可按 id 引用', async () => {
    const csv = [HEADERS, `BY-ID,按ID分类,${categoryId},仅按量体报价,,,,,,,`].join('\n');
    const { body } = await importCsv(csv);
    expect(body.data.created).toBe(1);
    const product = await productRepo.findOne({ where: { code: 'BY-ID' } });
    expect(product?.categoryId).toBe(categoryId);
  });

  it('停用分类不可挂载商品', async () => {
    const disabled = await categoryRepo.save(
      categoryRepo.create({
        code: 'it-import-off',
        name: '停用分类',
        parentId: null,
        level: 1,
        sortOrder: 0,
        status: 'DISABLED' as never,
      }),
    );

    const csv = [HEADERS, `OFF-001,停用分类商品,${disabled.code},仅按量体报价,,,,,,,`].join('\n');
    const { body } = await importCsv(csv);
    expect(body.data.created).toBe(0);
    expect(body.data.failed).toBe(1);
    expect(String(body.data.rows[0].reason)).toContain('停用');
  });

  it('dryRun 只校验不落库', async () => {
    const before = await productRepo.count();
    const csv = [HEADERS, `DRY-001,预检商品,${categoryCode},仅按量体报价,,,,,,,`].join('\n');

    const { status, body } = await importCsv(csv, true);
    expect(status).toBe(200);
    expect(body.data.dryRun).toBe(true);
    expect(body.data.created).toBe(0);
    expect(body.data.pending).toBe(1);
    expect(body.data.rows[0].status).toBe('PENDING');
    expect(await productRepo.count()).toBe(before);
  });

  it('店员也可以导入（录入资料），但仍然不能把商品直接上架', async () => {
    const csv = [HEADERS, `STAFF-001,店员导入商品,${categoryCode},仅按量体报价,,,,,,,`].join('\n');
    const { status, body } = await importCsv(csv, false, staffToken);
    expect(status).toBe(200);
    expect(body.data.created).toBe(1);

    const product = await productRepo.findOne({ where: { code: 'STAFF-001' } });
    expect(product?.status).toBe(ProductStatus.DRAFT);
  });

  it('未登录调用返回 401', async () => {
    const response = await http()
      .post('/api/v1/admin/products/import')
      .send({ csv: HEADERS });
    expect(response.status).toBe(401);
  });

  it('导入会写审计日志', async () => {
    const csv = [HEADERS, `AUDIT-001,审计商品,${categoryCode},仅按量体报价,,,,,,,`].join('\n');
    await importCsv(csv);

    const logs = await app
      .get(DataSource)
      .query("SELECT action FROM audit_logs WHERE action = 'product.import'");
    expect(Array.isArray(logs)).toBe(true);
    expect(logs.length).toBeGreaterThan(0);
  });
});
