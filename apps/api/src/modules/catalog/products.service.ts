import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  MediaRole,
  Paginated,
  PricingMode,
  ProductDetail,
  ProductListItem,
  ProductListQuery,
  ProductMediaUpsertRequest,
  ProductSnapshot,
  ProductStatus,
  ProductUpsertRequest,
} from '@qinyang/contracts';
import { In, Repository } from 'typeorm';
import { Category } from '../../database/entities/category.entity';
import { Product } from '../../database/entities/product.entity';
import { ProductMedia } from '../../database/entities/product-media.entity';
import { MeasurementTemplate } from '../../database/entities/measurement-template.entity';
import { BusinessException } from '../../common/errors/business.exception';
import { deriveThumbUrl } from '../../common/media-url';
import { AuditService } from '../audit/audit.service';
import { normalizePrice } from './pricing';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    @InjectRepository(ProductMedia)
    private readonly media: Repository<ProductMedia>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    @InjectRepository(MeasurementTemplate)
    private readonly templates: Repository<MeasurementTemplate>,
    private readonly audit: AuditService,
  ) {}

  // ───────────────────────── 顾客端 ─────────────────────────

  /** 公开列表：只返回已发布商品 */
  async listPublic(query: ProductListQuery): Promise<Paginated<ProductListItem>> {
    return this.listInternal(query, true);
  }

  /** 公开详情：未发布商品对顾客不可见 */
  async getPublic(id: string): Promise<ProductDetail> {
    const product = await this.findOne(id);
    if (!product) throw BusinessException.notFound('商品不存在');
    if (product.status !== ProductStatus.PUBLISHED) {
      throw BusinessException.notFound('商品已下架');
    }
    return this.toDetail(product);
  }

  // ───────────────────────── 管理端 ─────────────────────────

  async listAdmin(query: ProductListQuery): Promise<Paginated<ProductListItem>> {
    return this.listInternal(query, false);
  }

  async getAdmin(id: string): Promise<ProductDetail> {
    const product = await this.findOne(id);
    if (!product) throw BusinessException.notFound('商品不存在');
    return this.toDetail(product);
  }

  async create(dto: ProductUpsertRequest, admin: AdminPrincipal): Promise<ProductDetail> {
    const existing = await this.products.findOne({ where: { code: dto.code } });
    if (existing) {
      throw BusinessException.badRequest(`商品编号 ${dto.code} 已存在`);
    }
    await this.assertCategory(dto.categoryId);

    const entity = this.products.create({
      code: dto.code,
      name: dto.name,
      subtitle: dto.subtitle ?? null,
      categoryId: dto.categoryId,
      pricingMode: dto.pricingMode,
      priceCents: this.applyPricing(dto.pricingMode, dto.priceCents ?? null),
      material: dto.material ?? null,
      description: dto.description ?? null,
      careGuide: dto.careGuide ?? null,
      measurementTemplateId: dto.measurementTemplateId ?? null,
      sortOrder: dto.sortOrder ?? 0,
      // 新增商品一律为草稿：上下架是店主专属动作（OWNER 守卫在 status 接口上）。
      // 此前这里采纳 dto.status，STAFF 传 status=PUBLISHED 就能绕过店主审核直接上架。
      status: ProductStatus.DRAFT,
      createdById: admin.id,
      publishedAt: null,
    });

    const saved = await this.products.save(entity);
    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'product.create',
      targetType: 'product',
      targetId: saved.id,
      after: { code: saved.code, name: saved.name, status: saved.status },
      ip: null,
    });

    return this.toDetail(saved);
  }

  async update(
    id: string,
    dto: ProductUpsertRequest,
    admin: AdminPrincipal,
  ): Promise<ProductDetail> {
    const product = await this.findOne(id);
    if (!product) throw BusinessException.notFound('商品不存在');

    const before = this.auditSnapshot(product);
    await this.assertCategory(dto.categoryId);

    product.name = dto.name;
    product.subtitle = dto.subtitle ?? null;
    product.categoryId = dto.categoryId;
    product.pricingMode = dto.pricingMode;
    product.priceCents = this.applyPricing(dto.pricingMode, dto.priceCents ?? null);
    product.material = dto.material ?? null;
    product.description = dto.description ?? null;
    product.careGuide = dto.careGuide ?? null;
    product.measurementTemplateId = dto.measurementTemplateId ?? null;
    product.sortOrder = dto.sortOrder ?? product.sortOrder;

    const saved = await this.products.save(product);
    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'product.update',
      targetType: 'product',
      targetId: saved.id,
      before,
      after: this.auditSnapshot(saved),
      ip: null,
    });

    return this.toDetail(saved);
  }

  /** 上下架 / 提交审核。关键操作，OWNER 专属并留痕 */
  async changeStatus(
    id: string,
    status: ProductStatus,
    admin: AdminPrincipal,
  ): Promise<ProductDetail> {
    const product = await this.findOne(id);
    if (!product) throw BusinessException.notFound('商品不存在');

    const allowed = this.assertProductStatusTransition(product.status, status);
    if (!allowed) {
      throw BusinessException.conflict(
        `不允许从 ${product.status} 变更为 ${status}`,
        'INVALID_STATUS_TRANSITION',
      );
    }

    const before = this.auditSnapshot(product);
    product.status = status;
    if (status === ProductStatus.PUBLISHED && !product.publishedAt) {
      product.publishedAt = new Date();
    }
    const saved = await this.products.save(product);

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: `product.status.${status.toLowerCase()}`,
      targetType: 'product',
      targetId: saved.id,
      before,
      after: this.auditSnapshot(saved),
      ip: null,
    });

    return this.toDetail(saved);
  }

  async addMedia(
    id: string,
    dto: ProductMediaUpsertRequest,
    admin: AdminPrincipal,
  ): Promise<ProductDetail> {
    const product = await this.findOne(id);
    if (!product) throw BusinessException.notFound('商品不存在');

    const entity = this.media.create({
      productId: product.id,
      role: dto.role,
      storageKey: dto.storageKey,
      url: dto.url ?? '',
      width: dto.width ?? 0,
      height: dto.height ?? 0,
      bytes: dto.bytes ?? 0,
      alt: dto.alt ?? null,
      sortOrder: dto.sortOrder ?? 0,
    });
    await this.media.save(entity);

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'product.media.add',
      targetType: 'product',
      targetId: product.id,
      after: { role: dto.role, storageKey: dto.storageKey },
      ip: null,
    });

    return this.toDetail(product);
  }

  async removeMedia(
    id: string,
    mediaId: string,
    admin: AdminPrincipal,
  ): Promise<ProductDetail> {
    const product = await this.findOne(id);
    if (!product) throw BusinessException.notFound('商品不存在');

    const item = await this.media.findOne({ where: { id: mediaId, productId: product.id } });
    if (!item) throw BusinessException.notFound('图集条目不存在');
    await this.media.delete({ id: mediaId });

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'product.media.remove',
      targetType: 'product',
      targetId: product.id,
      before: { role: item.role, storageKey: item.storageKey },
      ip: null,
    });

    return this.toDetail(product);
  }

  /** 生成冻结用商品快照 */
  async buildSnapshot(productId: string): Promise<ProductSnapshot> {
    const product = await this.findOne(productId);
    if (!product) throw BusinessException.notFound('商品不存在');
    const category = await this.categories.findOne({ where: { id: product.categoryId } });
    const media = await this.media.find({
      where: { productId: product.id },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return {
      id: product.id,
      code: product.code,
      name: product.name,
      pricingMode: product.pricingMode,
      priceCents: product.priceCents,
      categoryName: category?.name ?? '',
      coverUrl: this.pickCover(media),
      media: media.map((m) => ({
        id: m.id,
        storageKey: m.storageKey,
        url: m.url,
        thumbUrl: deriveThumbUrl(m.url),
        role: m.role,
        width: m.width,
        height: m.height,
        bytes: m.bytes,
        sortOrder: m.sortOrder,
        alt: m.alt,
      })),
    };
  }

  // ───────────────────────── 内部实现 ─────────────────────────

  private async listInternal(
    query: ProductListQuery,
    publishedOnly: boolean,
  ): Promise<Paginated<ProductListItem>> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));

    const qb = this.products.createQueryBuilder('p');
    if (publishedOnly) {
      qb.andWhere('p.status = :published', { published: ProductStatus.PUBLISHED });
    } else {
      if (query.status) qb.andWhere('p.status = :status', { status: query.status });
      if (query.pricingMode) {
        qb.andWhere('p.pricingMode = :pricingMode', { pricingMode: query.pricingMode });
      }
    }
    if (query.categoryId) {
      // 分类过滤必须**包含下级分组**：商品挂在二级分组上，
      // 若按一级分类 id 精确匹配，顾客打开分类页看到的就是空列表
      // （小程序分类页默认传一级分类 id）。传入分组 id 时按精确匹配处理，
      // 因为分组没有子级。
      const category = await this.categories.findOne({
        where: { id: query.categoryId },
      });
      const children = category
        ? await this.categories.find({ where: { parentId: category.id } })
        : [];
      const categoryIds = category
        ? [category.id, ...children.map((child) => child.id)]
        : [query.categoryId];
      qb.andWhere('p.categoryId IN (:...categoryIds)', { categoryIds });
    }
    if (query.group) {
      // 二级分组过滤：命中该分组及其子分组
      const group = await this.categories.findOne({ where: { code: query.group } });
      if (!group) {
        return { items: [], total: 0, page, pageSize };
      }
      const children = await this.categories.find({ where: { parentId: group.id } });
      const ids = [group.id, ...children.map((child) => child.id)];
      qb.andWhere('p.categoryId IN (:...groupIds)', { groupIds: ids });
    }
    if (query.keyword) {
      qb.andWhere('(p.name LIKE :kw OR p.code LIKE :kw OR p.subtitle LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }

    qb.orderBy('p.sortOrder', 'ASC').addOrderBy('p.createdAt', 'DESC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    if (items.length === 0) {
      return { items: [], total, page, pageSize };
    }

    const categoryIds = [...new Set(items.map((item) => item.categoryId))];
    const categoryRows = await this.categories.find({
      where: { id: In(categoryIds) },
    });
    const categoryNames = new Map(categoryRows.map((c) => [c.id, c.name]));

    // 列表只需要封面：只取 COVER（无封面时退回 FRONT），
    // 此前把该页商品的**全部**图集行都拉回来（20 商品 × 约 9 张 ≈ 180 行），
    // 而列表只用到 1 张。
    const mediaRows = await this.media.find({
      where: {
        productId: In(items.map((item) => item.id)),
        role: In([MediaRole.COVER, MediaRole.FRONT]),
      },
      order: { sortOrder: 'ASC' },
    });
    const coverMap = new Map<string, string | null>();
    for (const row of mediaRows) {
      if (row.role === MediaRole.COVER && !coverMap.has(row.productId)) {
        coverMap.set(row.productId, row.url);
      }
    }
    for (const row of mediaRows) {
      if (!coverMap.has(row.productId)) {
        coverMap.set(row.productId, row.url);
      }
    }

    return {
      items: items.map((item) => {
        const coverUrl = coverMap.get(item.id) ?? null;
        return this.toListItem(
          item,
          categoryNames.get(item.categoryId) ?? '',
          coverUrl,
          deriveThumbUrl(coverUrl),
        );
      }),
      total,
      page,
      pageSize,
    };
  }

  /** 取商品实体（含 measurementTemplateId 等内部字段），供量体模板解析使用 */
  async findOne(id: string): Promise<Product | null> {
    return this.products.findOne({ where: { id } });
  }

  private async assertCategory(categoryId: string): Promise<void> {
    const category = await this.categories.findOne({ where: { id: categoryId } });
    if (!category) throw BusinessException.badRequest('分类不存在');
    if (category.status !== 'ACTIVE') {
      throw BusinessException.badRequest('该分类已停用，不能挂载商品');
    }
  }

  /** 定价规则：QUOTE_ONLY 恒为 null；FIXED_PRICE 必须是正整数分 */
  private applyPricing(mode: PricingMode, price: number | null): number | null {
    try {
      return normalizePrice(mode, price);
    } catch (error) {
      throw BusinessException.badRequest(
        error instanceof Error ? error.message : '价格不合法',
      );
    }
  }

  private assertProductStatusTransition(
    from: ProductStatus,
    to: ProductStatus,
  ): boolean {
    if (from === to) return true;
    const map: Record<ProductStatus, ProductStatus[]> = {
      [ProductStatus.DRAFT]: [ProductStatus.PENDING_REVIEW],
      [ProductStatus.PENDING_REVIEW]: [
        ProductStatus.PUBLISHED,
        ProductStatus.DRAFT,
        ProductStatus.OFFLINE,
      ],
      [ProductStatus.PUBLISHED]: [ProductStatus.OFFLINE],
      [ProductStatus.OFFLINE]: [
        ProductStatus.DRAFT,
        ProductStatus.PENDING_REVIEW,
        ProductStatus.PUBLISHED,
      ],
    };
    return map[from]?.includes(to) ?? false;
  }

  private pickCover(media: ProductMedia[]): string | null {
    const cover = media.find((m) => m.role === MediaRole.COVER);
    if (cover) return cover.url;
    const first = media.find((m) => m.role === MediaRole.FRONT) ?? media[0];
    return first?.url ?? null;
  }

  private toListItem(
    product: Product,
    categoryName: string,
    coverUrl: string | null,
    coverThumbUrl: string | null = null,
  ): ProductListItem {
    return {
      id: product.id,
      code: product.code,
      name: product.name,
      subtitle: product.subtitle,
      categoryId: product.categoryId,
      categoryName,
      status: product.status,
      pricingMode: product.pricingMode,
      priceCents:
        product.pricingMode === PricingMode.QUOTE_ONLY ? null : product.priceCents,
      coverUrl,
      coverThumbUrl,
      sortOrder: product.sortOrder,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private async toDetail(product: Product): Promise<ProductDetail> {
    const category = await this.categories.findOne({ where: { id: product.categoryId } });
    const media = await this.media.find({
      where: { productId: product.id },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const base = this.toListItem(
      product,
      category?.name ?? '',
      this.pickCover(media),
      deriveThumbUrl(this.pickCover(media)),
    );
    // 顾客需要知道「按哪套量体模板测量」——契约与小程序商品详情页都依赖这个字段，
    // 此前恒为 null，等于该信息从未送达顾客端。
    const template = product.measurementTemplateId
      ? await this.templates.findOne({ where: { id: product.measurementTemplateId } })
      : null;
    return {
      ...base,
      material: product.material,
      description: product.description,
      careGuide: product.careGuide,
      measurementTemplateId: product.measurementTemplateId,
      measurementTemplateName: template?.name ?? null,
      media: media.map((m) => ({
        id: m.id,
        storageKey: m.storageKey,
        url: m.url,
        thumbUrl: deriveThumbUrl(m.url),
        role: m.role,
        width: m.width,
        height: m.height,
        bytes: m.bytes,
        sortOrder: m.sortOrder,
        alt: m.alt,
      })),
      reviewStatus: product.status,
      publishedAt: product.publishedAt ? product.publishedAt.toISOString() : null,
    };
  }

  /** 审计快照：不包含量体与联系方式 */
  private auditSnapshot(product: Product): Record<string, unknown> {
    return {
      code: product.code,
      name: product.name,
      categoryId: product.categoryId,
      pricingMode: product.pricingMode,
      priceCents: product.priceCents,
      status: product.status,
      material: product.material,
      sortOrder: product.sortOrder,
    };
  }
}
