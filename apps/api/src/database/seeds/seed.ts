/**
 * 开发/测试环境种子数据。
 *
 * 原则：
 * 1. 只写入**已确认可从素材与原型推导**的字段。价格、材质、洗护、正式文案
 *    一律留 null（客户端显示「待报价 / 待确认」），不编造经营数据。
 * 2. 商品初始状态为 DRAFT，**不自动发布**。上架必须由管理员在后台显式操作，
 *    符合「未经商家确认的商品资料不自动发布」的要求。
 * 3. 量体资料、联系方式属敏感数据，种子只使用虚构值。
 * 4. 幂等：重复执行按唯一键更新，不产生重复数据。
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { MediaRole, PricingMode, ProductStatus, RequestStatus, TemplateStatus } from '@qinyang/contracts';
import { dataSourceOptions } from '../data-source';
import { entities } from '../entities';
import { AdminUser } from '../entities/admin-user.entity';
import { Banner } from '../entities/banner.entity';
import { Category } from '../entities/category.entity';
import { GuidePage } from '../entities/guide-page.entity';
import { MeasurementTemplate } from '../entities/measurement-template.entity';
import { Product } from '../entities/product.entity';
import { ProductMedia } from '../entities/product-media.entity';
import { AdminAuthService } from '../../modules/auth/admin-auth.service';

loadEnv();

const REPO_ROOT = resolve(__dirname, '../../../../..');

interface PrototypeProduct {
  product_id: string;
  product_name: string;
  category: string;
  category_label: string;
  group: string;
  group_label: string;
  visual_color: string;
  measurement_template_id: string | null;
  gallery: Array<{
    image_id: string;
    role: string;
    width: number;
    height: number;
  }>;
}

interface PrototypeCategory {
  id: string;
  label: string;
  groups: Array<{ id: string; label: string }>;
}

interface MediaManifest {
  entries: Array<{
    productCode: string;
    imageId: string;
    width: number;
    height: number;
    variants: Record<string, string>;
  }>;
}

interface TemplateFile {
  templates: Array<{
    template_id: string;
    template_name: string;
    applicable_category: string[];
    summary: string;
    measurement_sections: unknown[];
  }>;
}

/** 首批 10–15 件代表性商品，覆盖针织 / 衬衫 / 裤装 / 裙装 / 卫衣 / 围巾 */
const FIRST_BATCH = [
  'ED-0001',
  'ED-0003',
  'ED-0006',
  'ED-0007',
  'ED-0008',
  'ED-0009',
  'ED-0018',
  'ED-0021',
  'ED-0024',
  'ED-0032',
  'ED-0043',
  'ED-0060',
  'ED-0062',
];

const ROLE_MAP: Record<string, MediaRole> = {
  cover: MediaRole.COVER,
  front: MediaRole.FRONT,
  back: MediaRole.BACK,
  detail: MediaRole.DETAIL,
  fabric: MediaRole.FABRIC,
  model: MediaRole.MODEL,
  flatlay: MediaRole.FLATLAY,
  size_chart: MediaRole.SIZE_CHART,
  description: MediaRole.DESCRIPTION,
  other: MediaRole.DETAIL,
};

const readJson = <T>(path: string): T => {
  const full = resolve(REPO_ROOT, path);
  if (!existsSync(full)) {
    throw new Error(`种子所需文件缺失：${full}`);
  }
  return JSON.parse(readFileSync(full, 'utf-8')) as T;
};

const guidePages = (): Array<Partial<GuidePage>> => [
  {
    slug: 'measure-top',
    title: '上装量体指南',
    summary: '身体三围 + 合身上衣平铺尺寸，两组数据一起提交更准确。',
    sortOrder: 1,
    sections: [
      {
        id: 'body',
        title: '身体测量',
        description:
          '穿贴身衣物、赤脚或着薄鞋测量。软尺保持水平，贴合身体但不要勒紧；自然站立、双手自然下垂，平静呼吸后读数。',
        items: [
          '胸围：围量胸部最丰满处一周，软尺水平，贴合不勒紧。',
          '身高：背靠墙壁站直，双脚并拢，眼睛平视，不要踮脚。',
          '体重：同一台体重秤测量，同一时间、同样穿着状态读数更稳定。',
          '肩宽（身体）：自然垂手，量两侧肩峰最外点之间的水平距离。',
        ],
        illustration: null,
        fieldCodes: ['chest_bust', 'height', 'weight', 'shoulder_body'],
      },
      {
        id: 'garment_flat',
        title: '合身衣物平铺测量',
        description:
          '准备一件穿着合身、款式相近的上衣，自然平铺，不要拉伸衣身。平铺尺寸能更贴近想要的合身度。',
        items: [
          '肩宽：两侧肩缝端点平直量取，沿肩线走直。',
          '胸宽：衣身左右缝合处之间平铺横向量取。',
          '衣长：领口下沿量到下摆。',
          '袖长：肩缝端点沿袖子量到袖口（选填）。',
        ],
        illustration: null,
        fieldCodes: ['shoulder_flat', 'chest_flat', 'length_flat', 'sleeve_flat'],
      },
    ],
  },
  {
    slug: 'measure-bottom',
    title: '长裤量体指南',
    summary: '腰围、臀围、身高体重 + 合身长裤平铺尺寸。',
    sortOrder: 2,
    sections: [
      {
        id: 'body',
        title: '身体测量',
        description: '腰围与臀围都用软尺贴合身体测量，不勒紧、不扭转。',
        items: [
          '腰围：量取腰部最细处一圈。',
          '臀围：量取臀部最丰满处一圈。',
          '身高与体重：用于核对版型与尺码。',
        ],
        illustration: null,
        fieldCodes: ['waist', 'hip', 'height', 'weight'],
      },
      {
        id: 'garment_flat',
        title: '合身长裤平铺测量',
        description: '取一条穿着合身的长裤平铺后量取，不拉伸。',
        items: [
          '腰围（平铺）：裤腰左右缝合处横向量取。',
          '臀围（平铺）：臀部最宽处横向量取。',
          '裤长 / 裙长：从腰头上沿沿裤缝量到裤脚。',
        ],
        illustration: null,
        fieldCodes: ['waist_flat', 'hip_flat', 'length_flat'],
      },
    ],
  },
  {
    slug: 'care',
    title: '羊绒洗护指南',
    summary: '本页为通用建议稿，正式洗护说明需商家确认后替换。',
    sortOrder: 3,
    sections: [
      {
        id: 'clean',
        title: '日常清洁',
        description: '使用中性羊绒洗涤剂手洗或使用羊毛专用洗护程序。',
        items: [
          '水温不超过 30℃。',
          '洗涤时轻压，不要搓揉、不要拧绞。',
          '深浅色分开洗；含羊毛成分不宜高温烘干。',
        ],
        illustration: null,
        fieldCodes: [],
      },
      {
        id: 'dry',
        title: '晾晒与收纳',
        description: '洗后轻压吸水，平铺于通风阴凉处晾干。',
        items: [
          '避免暴晒与烘干。',
          '收纳前确认完全干燥，折好放入透气收纳袋。',
          '避免挤压变形与长期悬挂。',
        ],
        illustration: null,
        fieldCodes: [],
      },
      {
        id: 'daily',
        title: '穿着注意',
        description: '羊绒纤维较为娇贵，建议减少单次穿着频次。',
        items: [
          '轮换穿着，减少同一位置反复摩擦。',
          '出现轻微起球属正常现象，可用毛球修剪器小心处理。',
          '局部沾污优先局部清洁，不要整件频繁下水。',
        ],
        illustration: null,
        fieldCodes: [],
      },
    ],
  },
  {
    slug: 'material',
    title: '材质定制说明',
    summary: '本页为通用说明稿，正式材质与工艺描述需商家确认后替换。',
    sortOrder: 4,
    sections: [
      {
        id: 'custom',
        title: '按量体定制',
        description:
          '定制款不按固定尺码售卖，而是依据你提交的量体数据单独制版。',
        items: [
          '量体数据与工艺细节会在报价单中逐项列出。',
          '确认报价后才会开始制作。',
        ],
        illustration: null,
        fieldCodes: [],
      },
      {
        id: 'confirm',
        title: '确认与变更',
        description: '顾客确认报价后，量体数据与商品快照会被冻结。',
        items: [
          '制作开始前如需变更，请联系客服重新报价。',
          '重新报价会生成新的报价版本，历史版本可查。',
        ],
        illustration: null,
        fieldCodes: [],
      },
    ],
  },
];

async function seed(): Promise<void> {
  const dataSource = new DataSource(dataSourceOptions);
  await dataSource.initialize();
  console.log('[seed] 已连接数据库');

  const adminRepo = dataSource.getRepository(AdminUser);
  const categoryRepo = dataSource.getRepository(Category);
  const templateRepo = dataSource.getRepository(MeasurementTemplate);
  const productRepo = dataSource.getRepository(Product);
  const mediaRepo = dataSource.getRepository(ProductMedia);
  const bannerRepo = dataSource.getRepository(Banner);
  const guideRepo = dataSource.getRepository(GuidePage);

  // ── 1. 管理员 ───────────────────────────────────────────────
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Qinyang@2026';
  const passwordHash = await AdminAuthService.hashPassword(adminPassword);
  const admins: Array<Partial<AdminUser>> = [
    {
      username: process.env.SEED_OWNER_USERNAME ?? 'owner',
      displayName: '店主',
      role: 'OWNER' as never,
      status: 'ACTIVE' as never,
      passwordHash,
    },
    {
      username: process.env.SEED_STAFF_USERNAME ?? 'staff',
      displayName: '店员',
      role: 'STAFF' as never,
      status: 'ACTIVE' as never,
      passwordHash,
    },
  ];
  for (const admin of admins) {
    const existing = await adminRepo.findOne({ where: { username: admin.username! } });
    if (existing) {
      await adminRepo.update(existing.id, {
        displayName: admin.displayName!,
        role: admin.role!,
        passwordHash,
      });
    } else {
      await adminRepo.save(adminRepo.create(admin));
    }
  }
  console.log(`[seed] 管理员 ${admins.length} 个（默认密码来自 SEED_ADMIN_PASSWORD，务必在正式环境改掉）`);

  // ── 2. 分类（一级 + 二级）─────────────────────────────────────
  const prototypeCategories = readJson<{ categories: PrototypeCategory[] }>(
    'prototype/data/products.json',
  ).categories;

  const levelOneIds = new Map<string, string>();
  for (const [index, category] of prototypeCategories.entries()) {
    if (category.groups.length === 0 && category.id !== 'unknown') continue;
    const existing = await categoryRepo.findOne({ where: { code: category.id } });
    let saved: Category;
    if (existing) {
      existing.name = category.label;
      existing.sortOrder = index;
      saved = await categoryRepo.save(existing);
    } else {
      saved = await categoryRepo.save(
        categoryRepo.create({
          code: category.id,
          name: category.label,
          parentId: null,
          level: 1,
          sortOrder: index,
          status: 'ACTIVE',
        }),
      );
    }
    levelOneIds.set(category.id, saved.id);

    for (const [groupIndex, group] of category.groups.entries()) {
      const groupCode = `${category.id}-${group.id}`;
      const existingGroup = await categoryRepo.findOne({ where: { code: groupCode } });
      if (existingGroup) {
        existingGroup.name = group.label;
        existingGroup.parentId = saved.id;
        await categoryRepo.save(existingGroup);
      } else {
        await categoryRepo.save(
          categoryRepo.create({
            code: groupCode,
            name: group.label,
            parentId: saved.id,
            level: 2,
            sortOrder: groupIndex,
            status: 'ACTIVE',
          }),
        );
      }
    }
  }
  console.log(`[seed] 分类：一级 ${levelOneIds.size} 个，含二级分组`);

  // ── 3. 量体模板（ACTIVE 版本）──────────────────────────────
  const templateFile = readJson<TemplateFile>('prototype/data/measurement_templates.json');
  const templateIdByCode = new Map<string, string>();
  for (const template of templateFile.templates) {
    const existing = await templateRepo.findOne({
      where: { code: template.template_id, status: TemplateStatus.ACTIVE },
    });
    const payload = {
      name: template.template_name,
      applicableCategories: template.applicable_category ?? [],
      summary: template.summary ?? null,
      measurementSections: template.measurement_sections as never,
      status: TemplateStatus.ACTIVE,
    };
    if (existing) {
      await templateRepo.update(existing.id, payload);
      templateIdByCode.set(template.template_id, existing.id);
    } else {
      const saved = await templateRepo.save(
        templateRepo.create({
          code: template.template_id,
          version: 1,
          ...payload,
        }),
      );
      templateIdByCode.set(template.template_id, saved.id);
    }
  }
  console.log(`[seed] 量体模板 ${templateIdByCode.size} 个（ACTIVE）`);

  // ── 4. 商品与图集 ──────────────────────────────────────────
  const mediaManifest = readJson<MediaManifest>('media/manifest.json');
  const mediaByProduct = new Map<string, MediaManifest['entries']>();
  for (const entry of mediaManifest.entries) {
    const list = mediaByProduct.get(entry.productCode) ?? [];
    list.push(entry);
    mediaByProduct.set(entry.productCode, list);
  }

  const prototypeProducts = readJson<{ products: PrototypeProduct[] }>(
    'prototype/data/products.json',
  ).products;
  const prototypeById = new Map(prototypeProducts.map((item) => [item.product_id, item]));

  const publicBaseUrl =
    process.env.STORAGE_PUBLIC_BASE_URL ?? 'http://127.0.0.1:18110/static';

  let productCount = 0;
  for (const code of FIRST_BATCH) {
    const prototype = prototypeById.get(code);
    if (!prototype) {
      console.warn(`[seed] 跳过 ${code}：原型数据中不存在`);
      continue;
    }
    const groupCode = `${prototype.category}-${prototype.group}`;
    const group = await categoryRepo.findOne({ where: { code: groupCode } });
    if (!group) {
      console.warn(`[seed] 跳过 ${code}：分类 ${groupCode} 不存在`);
      continue;
    }

    const templateId = prototype.measurement_template_id
      ? templateIdByCode.get(prototype.measurement_template_id) ?? null
      : null;

    let product = await productRepo.findOne({ where: { code } });
    const payload = {
      name: prototype.product_name,
      subtitle: prototype.visual_color ? `颜色：${prototype.visual_color}` : null,
      categoryId: group.id,
      pricingMode: PricingMode.QUOTE_ONLY,
      priceCents: null,
      material: null,
      description: null,
      careGuide: null,
      measurementTemplateId: templateId,
      sortOrder: 0,
      status: ProductStatus.DRAFT,
    };
    if (product) {
      await productRepo.update(product.id, payload);
    } else {
      product = await productRepo.save(productRepo.create({ code, ...payload }));
    }
    productCount += 1;

    // 图集：一张源图一条记录，统一使用 4:5 展示版
    const entries = mediaByProduct.get(code) ?? [];
    const roleByImage = new Map(prototype.gallery.map((item) => [item.image_id, item.role]));
    await mediaRepo.delete({ productId: product.id });
    const rows = entries.map((entry, index) => {
      const variant = entry.variants['4x5'] ?? entry.variants['1x1'] ?? '';
      const fileName = variant.split('/').pop() ?? `${entry.imageId}.jpg`;
      const role = ROLE_MAP[roleByImage.get(entry.imageId) ?? 'other'] ?? MediaRole.DETAIL;
      return mediaRepo.create({
        productId: product!.id,
        role,
        storageKey: `products/${code}/${fileName}`,
        url: `${publicBaseUrl}/products/${code}/${fileName}`,
        width: entry.width,
        height: entry.height,
        bytes: 0,
        sortOrder: index,
        alt: `${prototype.product_name} ${index + 1}`,
      });
    });
    if (rows.length > 0) {
      await mediaRepo.save(rows);
    }
  }
  console.log(`[seed] 商品 ${productCount} 件（状态 DRAFT，需在后台显式上架）`);

  // ── 5. 首页轮播 ────────────────────────────────────────────
  const bannerSpecs = [
    { title: '琴扬精纺羊绒 · 定制服饰', code: 'ED-0032' },
    { title: '针织开衫系列', code: 'ED-0006' },
    { title: '长裤定制', code: 'ED-0021' },
  ];
  let bannerIndex = 0;
  for (const spec of bannerSpecs) {
    const product = await productRepo.findOne({ where: { code: spec.code } });
    if (!product) continue;
    const cover = await mediaRepo.findOne({
      where: { productId: product.id, role: MediaRole.COVER },
    });
    if (!cover) continue;
    const existing = await bannerRepo.findOne({ where: { title: spec.title } });
    const payload = {
      imageUrl: cover.url,
      storageKey: cover.storageKey,
      linkType: 'PRODUCT' as never,
      linkValue: product.id,
      sortOrder: bannerIndex,
      status: 'ACTIVE' as never,
      startAt: null,
      endAt: null,
    };
    if (existing) {
      await bannerRepo.update(existing.id, payload);
    } else {
      await bannerRepo.save(bannerRepo.create({ title: spec.title, ...payload }));
    }
    bannerIndex += 1;
  }
  console.log(`[seed] 轮播 ${bannerIndex} 条`);

  // ── 6. 图文说明页 ──────────────────────────────────────────
  for (const page of guidePages()) {
    const existing = await guideRepo.findOne({ where: { slug: page.slug! } });
    if (existing) {
      await guideRepo.update(existing.id, {
        title: page.title!,
        summary: page.summary ?? null,
        sections: page.sections as never,
        sortOrder: page.sortOrder ?? 0,
        status: 'ACTIVE',
      });
    } else {
      await guideRepo.save(guideRepo.create({ ...page, status: 'ACTIVE' } as never));
    }
  }
  console.log(`[seed] 图文说明页 ${guidePages().length} 个`);

  await dataSource.destroy();
  console.log('[seed] 完成');
}

seed().catch((error) => {
  console.error('[seed] 失败：', error);
  process.exitCode = 1;
});
