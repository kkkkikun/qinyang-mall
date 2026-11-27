import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  AdminRole,
  MediaRole,
  Paginated,
  PricingMode,
  ProductDetail,
  ProductListItem,
  ProductListQuery,
  ProductBatchStatusResult,
  ProductMediaUpdateRequest,
  ProductMediaUpsertRequest,
  ProductSnapshot,
  ProductStatus,
  ProductUpsertRequest,
} from '@qinyang/contracts';
import { DataSource, In, OptimisticLockVersionMismatchError, QueryDeepPartialEntity, Repository } from 'typeorm';
import { Category } from '../../database/entities/category.entity';
import { Product } from '../../database/entities/product.entity';
import { ProductMedia } from '../../database/entities/product-media.entity';
import { MeasurementTemplate } from '../../database/entities/measurement-template.entity';
import { BusinessException } from '../../common/errors/business.exception';
import { isDuplicateKey } from '../../common/errors/duplicate-key';
import { ERROR_CODES } from '@qinyang/contracts';
import { deriveThumbUrl } from '../../common/media-url';
import { AuditService } from '../audit/audit.service';
import { normalizePrice } from './pricing';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

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
    private readonly dataSource: DataSource,
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

    /*
     * 并发建同一个编号时，上面的「先查后写」会双双落空，
     * 最终由唯一索引 UQ_products_code 兜底 —— 重复键翻译成 409，
     * 而不是让它冒泡成 500（申请 / 报价 / 订单路径此前已经这么处理了，
     * 只有商品这条路径漏了）。
     */
    let saved: Product;
    try {
      saved = await this.products.save(entity);
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw BusinessException.conflict(
          `商品编号 ${dto.code} 已存在`,
          ERROR_CODES.DUPLICATED_SUBMIT,
        );
      }
      throw error;
    }
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

    /*
     * 已发布商品的价格口径。
     *
     * 此前店员可以直接把**在售商品的价格**改掉，且没有任何审核或留痕之外的约束 ——
     * 顾客端展示的金额会在一次「保存」里悄悄变化。
     *
     * 规则：**已发布商品的价格 / 报价模式只能由店主修改**（店员 409）。
     * 文案与资料（名称 / 材质 / 简介 / 洗护 / 分类 / 量体模板）店员仍可编辑，
     * 改动照常进审计。
     *
     * 这里刻意**不**做成「改价自动下架 / 自动打回待审核」：
     * 那会把商家的日常改错字也变成「商品消失」，运营成本远大于收益；
     * 而权限口径与既有的「上下架/报价是店主专属」保持一致，不引入新的流程。
     */
    const nextPriceCents = this.applyPricing(dto.pricingMode, dto.priceCents ?? null);
    if (product.status === ProductStatus.PUBLISHED) {
      const priceChanged =
        product.pricingMode !== dto.pricingMode || product.priceCents !== nextPriceCents;
      if (priceChanged && admin.role !== AdminRole.OWNER) {
        throw BusinessException.conflict(
          '已发布商品的价格只能由店主修改',
          ERROR_CODES.FORBIDDEN,
        );
      }
    }

    /*
     * 客户端回传了「我打开时看到的行版本」→ 与库里的现况不符就是有人改过。
     *
     * 下面 WHERE 里的 version 只能挡住「两个请求在同一瞬间重叠」：
     * 商家 A 打开编辑抽屉 → 商家 B 改完保存 → A 十分钟后保存，
     * A 手里是**整行陈旧内容**，会把 B 的改动静默覆盖，而 A 拿到的是 200。
     * 所以客户端把打开时看到的版本带回来，这里先做一次比对，不一致就 409。
     *
     * 不传 expectedVersion 时保持原行为（服务端读到什么版本就写什么版本）。
     */
    if (dto.expectedVersion !== undefined && dto.expectedVersion !== product.version) {
      throw BusinessException.conflict(
        '商品已被他人修改，请刷新后重试',
        ERROR_CODES.VERSION_CONFLICT,
      );
    }

    /*
     * 真正的乐观锁：按版本号**条件更新**。
     *
     * 此前这里是 `save(product)` 整行回写，而 TypeORM 的 save() **并不做乐观锁** ——
     * 它生成的 UPDATE 是 `SET ..., version = version + 1 WHERE id = ?`，
     * WHERE 里没有版本号：两个店员同时改同一件商品时，后保存的那份会**静默覆盖**
     * 先保存的那份（改动直接丢失，商家毫无感知），
     * 更糟的是陈旧实体还会把 version 写回旧值（1 → 1），版本号形同虚设。
     *
     * 改成「WHERE id = ? AND version = ?」后：版本号对不上就一条都写不进去，
     * affected = 0 → 409「商品已被他人修改，请刷新后重试」。
     */
    const changes = {
      name: dto.name,
      subtitle: dto.subtitle ?? null,
      categoryId: dto.categoryId,
      pricingMode: dto.pricingMode,
      priceCents: nextPriceCents,
      material: dto.material ?? null,
      description: dto.description ?? null,
      careGuide: dto.careGuide ?? null,
      measurementTemplateId: dto.measurementTemplateId ?? null,
      sortOrder: dto.sortOrder ?? product.sortOrder,
    };

    let saved: Product;
    try {
      const affected = await this.products.update(
        { id: product.id, version: product.version },
        changes,
      );
      if (affected.affected !== 1) {
        throw BusinessException.conflict(
          '商品已被他人修改，请刷新后重试',
          ERROR_CODES.VERSION_CONFLICT,
        );
      }
      saved = await this.reload(id);
    } catch (error) {
      // 防御性：若将来改用 findOne 的乐观锁读（lock: optimistic），
      // 冲突同样是「别人先改了一步」，一并翻译成 409 而不是 500。
      if (error instanceof OptimisticLockVersionMismatchError) {
        throw BusinessException.conflict(
          '商品已被他人修改，请刷新后重试',
          ERROR_CODES.VERSION_CONFLICT,
        );
      }
      throw error;
    }
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
    /*
     * 同 update：按版本号**条件更新**，期间被人改过就 409（而不是静默覆盖）。
     *
     * 条件里额外带上 `status: product.status`（期望旧状态）：
     * 状态机合法性与乐观锁一次搞定 —— 期间有人把状态改成别的（比如抢先上架），
     * 这一条就写不进去（affected = 0 → 409），
     * 不会出现「按旧状态算出来的合法流转被写到新状态上」。
     */
    const changes: QueryDeepPartialEntity<Product> = { status };
    if (status === ProductStatus.PUBLISHED && !product.publishedAt) {
      changes.publishedAt = new Date();
    }
    let saved: Product;
    try {
      const affected = await this.products.update(
        { id: product.id, version: product.version, status: product.status },
        changes,
      );
      if (affected.affected !== 1) {
        throw BusinessException.conflict(
          '商品已被他人修改，请刷新后重试',
          ERROR_CODES.VERSION_CONFLICT,
        );
      }
      saved = await this.reload(id);
    } catch (error) {
      // 防御性：若将来改用 findOne 的乐观锁读（lock: optimistic），
      // 冲突同样是「别人先改了一步」，一并翻译成 409 而不是 500。
      if (error instanceof OptimisticLockVersionMismatchError) {
        throw BusinessException.conflict(
          '商品已被他人修改，请刷新后重试',
          ERROR_CODES.VERSION_CONFLICT,
        );
      }
      throw error;
    }

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

  /** 条件更新成功后重新读取商品（拿到最新版本号与时间戳） */
  private async reload(id: string): Promise<Product> {
    const fresh = await this.findOne(id);
    if (!fresh) throw BusinessException.notFound('商品不存在');
    return fresh;
  }

  /**
   * 删除商品。
   *
   * 此前商品只有「下架」，没有「删除」——
   * 商家误建或误导入的商品会**永远**躺在商品列表里（只是被推到末尾），
   * 每一次自动化验证也会留下一件 `VERIFY-*` 垃圾商品。
   *
   * 删除口径（宁可少删，不可错删）：
   * - **已发布（PUBLISHED）不直接删** —— 先下架再删，避免线上商品凭空消失；
   * - **被定制申请引用过的不删** —— 申请、报价、订单都指向它，
   *   删掉后商家的历史单据就断了线。
   */
  async remove(id: string, admin: AdminPrincipal): Promise<void> {
    const product = await this.findOne(id);
    if (!product) throw BusinessException.notFound('商品不存在');

    if (product.status === ProductStatus.PUBLISHED) {
      throw BusinessException.conflict(
        '已发布商品不能直接删除，请先下架再删除',
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    const rows = await this.dataSource.query(
      'SELECT COUNT(*) AS cnt FROM customization_requests WHERE productId = ?',
      [id],
    );
    const referenced = Number(rows?.[0]?.cnt ?? 0);
    if (referenced > 0) {
      throw BusinessException.conflict(
        `该商品已被 ${referenced} 笔定制申请引用，不能删除`,
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    // 图集与商品本体一起删：留下孤儿图集行没有意义，还会让唯一索引占位
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(ProductMedia, { productId: id });
      await manager.delete(Product, { id });
    });

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'product.delete',
      targetType: 'product',
      targetId: id,
      before: { code: product.code, name: product.name, status: product.status },
      ip: null,
    });
  }

  async addMedia(
    id: string,
    dto: ProductMediaUpsertRequest,
    admin: AdminPrincipal,
  ): Promise<ProductDetail> {
    const product = await this.findOne(id);
    if (!product) throw BusinessException.notFound('商品不存在');

    /*
     * 图片地址必填。
     *
     * 此前 url 允许空串，于是图集里会出现 url = '' 的条目 ——
     * 顾客端拼出来的图片地址是空串，直接裂图；
     * 而「有图」这件事在后台看起来是正常的，商家很难自己发现。
     */
    const url = dto.url?.trim();
    if (!url) {
      throw BusinessException.badRequest('图片地址不能为空');
    }

    /*
     * 同一张图片（storageKey 相同）重复添加时改为更新角色与排序，
     * 而不是再插一条 —— 「设为封面」会新增一条重复记录，
     * 顾客端图集里同一张图出现两次。
     *
     * 但「先查后写」在并发下会双双落空：两个店员同时点「添加图片」，
     * 两次都查不到 → 插出两条同 storageKey 的行。
     * （数据库层唯一索引 (productId, storageKey) 上线后是双保险，
     * 但这里不能依赖它 —— 索引到位之前也要保证只有一条。）
     *
     * 做法：在事务里**锁住商品行**，把「查 → 写」串行化，
     * 后到者必然能看到先到者刚插入的那条，转成更新。
     */
    await this.dataSource.transaction(async (manager) => {
      const mediaRepo = manager.getRepository(ProductMedia);
      const productRepo = manager.getRepository(Product);
      const locked = await productRepo.findOne({
        where: { id: product.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw BusinessException.notFound('商品不存在');

      const existing = await mediaRepo.findOne({
        where: { productId: product.id, storageKey: dto.storageKey },
      });
      if (existing) {
        await mediaRepo.update(
          { id: existing.id },
          {
            role: dto.role,
            url,
            alt: dto.alt ?? existing.alt,
            sortOrder: dto.sortOrder ?? existing.sortOrder,
          },
        );
        return;
      }
      try {
        await mediaRepo.save(
          mediaRepo.create({
            productId: product.id,
            role: dto.role,
            storageKey: dto.storageKey,
            url,
            width: dto.width ?? 0,
            height: dto.height ?? 0,
            bytes: dto.bytes ?? 0,
            alt: dto.alt ?? null,
            sortOrder: dto.sortOrder ?? 0,
          }),
        );
      } catch (error) {
        // 唯一索引上线后的兜底：同一张图被并发插入 → 翻译成人话
        if (isDuplicateKey(error)) {
          throw BusinessException.conflict(
            '该图片已在图集中，请刷新后重试',
            ERROR_CODES.DUPLICATED_SUBMIT,
          );
        }
        throw error;
      }
    });

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

  /**
   * 更新图集条目（排序 / 角色 / 说明）。
   *
   * 此前图集顺序上传后即固定，商家想调整顺序只能删掉重传；
   * 这里开放单项更新，配合后台的「上移/下移」按钮即可原地调整。
   */
  async updateMedia(
    id: string,
    mediaId: string,
    dto: ProductMediaUpdateRequest,
    admin: AdminPrincipal,
  ): Promise<ProductDetail> {
    const product = await this.findOne(id);
    if (!product) throw BusinessException.notFound('商品不存在');

    const item = await this.media.findOne({ where: { id: mediaId, productId: product.id } });
    if (!item) throw BusinessException.notFound('图集条目不存在');

    const before = { role: item.role, sortOrder: item.sortOrder };
    if (dto.role !== undefined) item.role = dto.role;
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.alt !== undefined) item.alt = dto.alt;
    const saved = await this.media.save(item);

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'product.media.update',
      targetType: 'product',
      targetId: product.id,
      before,
      after: { role: saved.role, sortOrder: saved.sortOrder },
      ip: null,
    });

    return this.toDetail(product);
  }

  /**
   * 批量上下架（店主专属）。
   *
   * 单条失败不影响其余条目：逐条给出原因，商家能立刻知道是哪一件没成功。
   */
  async batchChangeStatus(
    ids: string[],
    status: ProductStatus,
    admin: AdminPrincipal,
  ): Promise<ProductBatchStatusResult> {
    const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))];
    const skipped: { id: string; reason: string }[] = [];
    let updated = 0;

    for (const id of unique) {
      try {
        await this.changeStatus(id, status, admin);
        updated += 1;
      } catch (error) {
        /*
         * 「为什么没成功」是给商家看的，不能把底层异常原文回显。
         * 此前直接用 error.message，于是 TypeORM 的英文报错
         * （含表名、列名、SQL 片段）会原样出现在后台界面上。
         *
         * 业务异常的消息本来就是写给商家看的（"不允许从 DRAFT 变更为…"），
         * 可以直接用；其余一律归为「状态已被他人变更」，细节只进服务端日志。
         */
        if (error instanceof BusinessException) {
          skipped.push({ id, reason: error.message });
        } else {
          this.logger.error(`批量上下架失败 id=${id}：${(error as Error).message}`);
          skipped.push({ id, reason: '该商品状态已被他人变更，请刷新后重试' });
        }
      }
    }

    return { updated, skipped };
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

    /*
     * 列表封面与详情封面**必须是同一个口径**。
     *
     * 此前列表只取 role IN (COVER, FRONT)，详情却是 COVER ?? FRONT ?? media[0] ——
     * 只上传了 DETAIL 图的商品，列表里没有封面（顾客看到空白卡片），
     * 详情页却有图。同一件商品在两个页面长得不一样，是最容易被当成「商品没图」的投诉。
     *
     * 这里改成与 pickCover 完全一致：COVER → FRONT → 任意一张。
     * 仍然是**一次批量查询**取回本页商品的图集行（不逐商品查库），
     * 只多带回一些行，不引入 N+1。
     */
    const mediaRows = await this.media.find({
      where: { productId: In(items.map((item) => item.id)) },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
      select: { id: true, productId: true, role: true, url: true, sortOrder: true, createdAt: true },
    });
    const mediaByProduct = new Map<string, ProductMedia[]>();
    for (const row of mediaRows) {
      const list = mediaByProduct.get(row.productId);
      if (list) {
        list.push(row);
      } else {
        mediaByProduct.set(row.productId, [row]);
      }
    }

    return {
      items: items.map((item) => {
        const coverUrl = this.pickCover(mediaByProduct.get(item.id) ?? []);
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
      /** 行版本（乐观锁）：编辑时回传，服务端据此判断「期间是否被人改过」 */
      version: product.version,
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
