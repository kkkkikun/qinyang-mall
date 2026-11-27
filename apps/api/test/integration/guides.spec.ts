import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { AdminRole, MeasurementType, TemplateStatus } from '@qinyang/contracts';
import { AppModule } from '../../src/app.module';
import { configureBodyParsers } from '../../src/common/http/body-parser';
import { AdminUser } from '../../src/database/entities/admin-user.entity';
import { AuditLog } from '../../src/database/entities/audit-log.entity';
import { GuidePage } from '../../src/database/entities/guide-page.entity';
import { MeasurementTemplate } from '../../src/database/entities/measurement-template.entity';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../../src/common/interceptors/response.interceptor';

/**
 * 图文说明页（量体指南 / 洗护指南 / 材质说明）的后台维护能力。
 *
 * 背景（第十轮）：
 * `GuidesService.update()` 此前只被自己调用 —— **没有任何控制器暴露它**，
 * 于是这几页内容只能改种子数据，商家在后台改不了顾客看到的量体说明与洗护说明。
 *
 * 第十一轮补上了「量体示意图」这条链路：
 * 商家在后台勾选分节要展示哪些量体字段（`fieldCodes`），
 * 服务端按 `fieldCodes` 从**已发布量体模板**解析出字段名 / 测量说明 / 配图，
 * 顾客端直接渲染 —— 此前小程序把 `fields` 写死成空数组，
 * **接口一有内容，量体示意图就整体消失**。
 */
describe('图文说明页后台维护', () => {
  let app: INestApplication;
  let adminRepo: Repository<AdminUser>;
  let guideRepo: Repository<GuidePage>;
  let templateRepo: Repository<MeasurementTemplate>;
  let auditRepo: Repository<AuditLog>;

  let ownerToken: string;
  let staffToken: string;

  const http = () => request(app.getHttpServer());

  const MEASURE_FIELDS = [
    {
      fieldCode: 'chest_bust',
      fieldName: '胸围',
      measurementType: MeasurementType.BODY,
      unit: 'cm',
      required: true,
      min: 60,
      max: 140,
      step: 0.5,
      instruction: '围量胸部最丰满处一周',
      tips: ['软尺水平', '贴合不勒紧'],
      illustration: 'prototype/assets/img/measure/chest.svg',
    },
    {
      fieldCode: 'height',
      fieldName: '身高',
      measurementType: MeasurementType.BODY,
      unit: 'cm',
      required: true,
      min: 120,
      max: 210,
      step: 0.5,
      instruction: '背靠墙壁站直',
      tips: ['不要踮脚'],
      illustration: 'prototype/assets/img/measure/height.svg',
    },
  ];

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
    guideRepo = moduleRef.get<Repository<GuidePage>>(getRepositoryToken(GuidePage));
    templateRepo = moduleRef.get<Repository<MeasurementTemplate>>(
      getRepositoryToken(MeasurementTemplate),
    );
    auditRepo = moduleRef.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));

    const hash = await bcrypt.hash('Test@12345', 4);
    await adminRepo.save([
      adminRepo.create({
        username: 'it-guide-owner',
        displayName: '店主',
        passwordHash: hash,
        role: AdminRole.OWNER,
        status: 'ACTIVE' as never,
      }),
      adminRepo.create({
        username: 'it-guide-staff',
        displayName: '店员',
        passwordHash: hash,
        role: AdminRole.STAFF,
        status: 'ACTIVE' as never,
      }),
    ]);

    await templateRepo.save(
      templateRepo.create({
        code: 'TPL-GUIDE-TEST',
        name: '引导页测试模板',
        version: 1,
        status: TemplateStatus.ACTIVE,
        applicableCategories: [],
        summary: '集成测试用',
        measurementSections: [
          {
            sectionId: 'body',
            title: '身体测量',
            measurementType: MeasurementType.BODY,
            measurementFields: MEASURE_FIELDS,
          },
        ],
      }),
    );

    await guideRepo.save([
      guideRepo.create({
        slug: 'measure-top',
        title: '上装量体指南',
        summary: '原始摘要',
        sections: [
          {
            id: 'body',
            title: '身体测量',
            description: '原始说明',
            items: ['原始要点'],
            illustration: null,
            fieldCodes: ['chest_bust'],
          },
        ],
        sortOrder: 0,
        status: 'ACTIVE',
      }),
      guideRepo.create({
        slug: 'care',
        title: '羊绒洗护指南',
        summary: '洗护说明',
        sections: [],
        sortOrder: 1,
        status: 'ACTIVE',
      }),
      guideRepo.create({
        slug: 'retired',
        title: '已停用页',
        summary: null,
        sections: [],
        sortOrder: 2,
        status: 'DISABLED',
      }),
    ]);

    const login = async (username: string): Promise<string> => {
      const res = await http()
        .post('/api/v1/admin/auth/login')
        .send({ username, password: 'Test@12345' })
        .expect(200);
      return res.body.data.token;
    };
    ownerToken = await login('it-guide-owner');
    staffToken = await login('it-guide-staff');
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('未登录不能读取后台图文说明页列表', async () => {
    await http().get('/api/v1/admin/guides').expect(401);
  });

  it('后台列表返回全部图文说明页（含停用）', async () => {
    const res = await http()
      .get('/api/v1/admin/guides')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const slugs = res.body.data.map((row: { slug: string }) => row.slug);
    expect(slugs).toContain('measure-top');
    expect(slugs).toContain('care');
    // 停用页对后台可见（只有顾客端看不到）
    expect(slugs).toContain('retired');
  });

  it('顾客端只看到启用中的图文说明页', async () => {
    const ok = await http().get('/api/v1/guides/measure-top').expect(200);
    expect(ok.body.data.slug).toBe('measure-top');

    await http().get('/api/v1/guides/retired').expect(404);
    await http().get('/api/v1/guides/not-exist').expect(404);
  });

  it('后台更新后，顾客端立即读到新内容', async () => {
    await http()
      .put('/api/v1/admin/guides/measure-top')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        title: '上装量体指南（新）',
        summary: '新摘要',
        sections: [
          {
            id: 'body',
            title: '身体测量（新）',
            description: '新说明',
            items: ['第一条要点', '第二条要点'],
            illustration: null,
            fieldCodes: ['chest_bust', 'height'],
          },
        ],
      })
      .expect(200);

    const res = await http().get('/api/v1/guides/measure-top').expect(200);
    expect(res.body.data.title).toBe('上装量体指南（新）');
    expect(res.body.data.summary).toBe('新摘要');
    expect(res.body.data.sections[0].title).toBe('身体测量（新）');
    expect(res.body.data.sections[0].items).toEqual(['第一条要点', '第二条要点']);
  });

  it('fieldCodes 被解析成量体字段元数据（顾客端示意图数据源）', async () => {
    const res = await http().get('/api/v1/guides/measure-top').expect(200);
    const section = res.body.data.sections[0];
    expect(section.fieldCodes).toEqual(['chest_bust', 'height']);
    expect(Array.isArray(section.fields)).toBe(true);
    expect(section.fields.length).toBe(2);
    const chest = section.fields.find((f: { fieldCode: string }) => f.fieldCode === 'chest_bust');
    expect(chest.fieldName).toBe('胸围');
    expect(chest.instruction).toBe('围量胸部最丰满处一周');
    expect(chest.tips).toEqual(['软尺水平', '贴合不勒紧']);
    expect(chest.illustration).toBe('prototype/assets/img/measure/chest.svg');
  });

  it('引用了不存在的 fieldCode 时不报错，只是解析不出示意图', async () => {
    await http()
      .put('/api/v1/admin/guides/measure-top')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        sections: [
          {
            id: 'body',
            title: '身体测量',
            items: [],
            fieldCodes: ['not_a_real_field'],
          },
        ],
      })
      .expect(200);

    const res = await http().get('/api/v1/guides/measure-top').expect(200);
    expect(res.body.data.sections[0].fields).toEqual([]);
  });

  it('店员可以维护图文说明内容（与编辑商品文案同属内容维护）', async () => {
    const res = await http()
      .put('/api/v1/admin/guides/care')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ title: '洗护说明（店员改）' })
      .expect(200);
    expect(res.body.data.title).toBe('洗护说明（店员改）');
  });

  it('空分节标题被拒绝（避免顾客端出现无标题分节）', async () => {
    await http()
      .put('/api/v1/admin/guides/care')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        sections: [{ id: 'x', title: '   ', items: [], fieldCodes: [] }],
      })
      .expect(400);
  });

  it('非字符串要点被拒绝（json 列不能被写入任意结构）', async () => {
    await http()
      .put('/api/v1/admin/guides/care')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        sections: [{ id: 'x', title: '分节', items: [{ $ne: null }], fieldCodes: [] }],
      })
      .expect(400);
  });

  it('不允许提交服务端解析出来的 fields（只读字段不可伪造）', async () => {
    await http()
      .put('/api/v1/admin/guides/care')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        sections: [
          {
            id: 'x',
            title: '分节',
            items: [],
            fieldCodes: [],
            fields: [{ fieldCode: 'chest_bust', fieldName: '伪造的名称' }],
          },
        ],
      })
      .expect(400);
  });

  it('并发更新同一页：只会成功一次，另一方拿到 409（不静默覆盖）', async () => {
    const [a, b] = await Promise.all([
      http()
        .put('/api/v1/admin/guides/care')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: '并发版本 A' }),
      http()
        .put('/api/v1/admin/guides/care')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ title: '并发版本 B' }),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);

    // 冲突方的业务码必须是「状态/版本冲突」，不能是 500
    const conflict = a.status === 409 ? a : b;
    expect(conflict.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('更新后写入审计日志', async () => {
    const rows = await auditRepo.find({ where: { action: 'guide.update' } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].targetType).toBe('guide_page');
  });

  it('审计不含量体明细与顾客联系方式', async () => {
    const rows = await auditRepo.find({ where: { action: 'guide.update' } });
    const blob = JSON.stringify(rows.map((row) => row.after ?? {}));
    expect(blob).not.toContain('chest_bust');
    expect(blob).not.toContain('138');
  });
});
