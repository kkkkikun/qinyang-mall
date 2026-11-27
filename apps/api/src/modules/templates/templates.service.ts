import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  ERROR_CODES,
  MeasurementTemplateDto,
  MeasurementTemplateUpsertRequest,
  TemplateStatus,
} from '@qinyang/contracts';

import { MeasurementTemplate } from '../../database/entities/measurement-template.entity';
import { Category } from '../../database/entities/category.entity';
import { BusinessException } from '../../common/errors/business.exception';
import { isDuplicateKey } from '../../common/errors/duplicate-key';
import { AuditService } from '../audit/audit.service';
import { toMeasurementSections } from './measurement-shape';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(MeasurementTemplate)
    private readonly repo: Repository<MeasurementTemplate>,
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async list(): Promise<MeasurementTemplateDto[]> {
    const rows = await this.repo.find({
      order: { code: 'ASC', version: 'DESC' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async get(id: string): Promise<MeasurementTemplateDto> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw BusinessException.notFound('量体模板不存在');
    return this.toDto(row);
  }

  /**
   * 按商品解析量体模板。
   *
   * 优先使用商品**显式绑定**的模板（product.measurementTemplateId），
   * 未绑定或绑定模板非 ACTIVE 时，才按分类回退。
   *
   * 为什么必须只有一个解析入口：
   * 顾客端的量体表单按本接口渲染，而服务端提交时按**同一个模板**校验。
   * 两处若各走各的（一个按商品绑定、一个按分类），顾客会看到 A 模板的字段，
   * 却被服务端按 B 模板判定为「不属于该商品的量体模板」而拒收。
   */
  async resolveForProduct(product: {
    measurementTemplateId?: string | null;
    categoryId: string;
  }): Promise<MeasurementTemplateDto | null> {
    if (product.measurementTemplateId) {
      const bound = await this.repo.findOne({
        where: { id: product.measurementTemplateId },
      });
      if (bound && bound.status === TemplateStatus.ACTIVE) {
        return this.toDto(bound);
      }
    }
    return this.resolveForCategory(product.categoryId);
  }

  /**
   * 按商品分类解析当前可用（ACTIVE）的模板。
   * 兼容两级分类：模板的适用分类可以写分类 id、一级分类 code，
   * 或二级分类 code，三者任一命中即可。
   */
  async resolveForCategory(categoryId: string): Promise<MeasurementTemplateDto | null> {
    const category = await this.categories.findOne({ where: { id: categoryId } });
    if (!category) return null;

    const parent = category.parentId
      ? await this.categories.findOne({ where: { id: category.parentId } })
      : null;

    const keys = new Set<string>([category.id, category.code]);
    if (parent) {
      keys.add(parent.id);
      keys.add(parent.code);
    }

    const active = await this.repo.find({
      where: { status: TemplateStatus.ACTIVE },
      order: { version: 'DESC' },
    });
    for (const row of active) {
      const applicable = (row.applicableCategories ?? []) as string[];
      if (applicable.some((item) => keys.has(item))) {
        return this.toDto(row);
      }
    }
    return null;
  }

  async create(
    dto: MeasurementTemplateUpsertRequest,
    admin: AdminPrincipal,
  ): Promise<MeasurementTemplateDto> {
    const sameCode = await this.repo.find({
      where: { code: dto.code },
      order: { version: 'DESC' },
    });
    const version = sameCode.length === 0 ? 1 : sameCode[0].version + 1;

    const entity = this.repo.create({
      code: dto.code,
      name: dto.name,
      version,
      status: dto.publish ? TemplateStatus.ACTIVE : TemplateStatus.DRAFT,
      applicableCategories: dto.applicableCategories ?? [],
      summary: dto.summary ?? null,
      measurementSections: dto.measurementSections ?? [],
    });

    /*
     * 「归档旧 ACTIVE + 建新版本」必须同生共死：
     * 此前是两步，中间失败就会**一个 ACTIVE 都不剩** ——
     * 顾客端立刻无法提交定制申请（按 code 找不到可用模板）。
     */
    let saved: MeasurementTemplate;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        if (dto.publish) {
          await this.archiveActive(dto.code, manager);
        }
        return manager.getRepository(MeasurementTemplate).save(entity);
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw BusinessException.conflict(
          `模板 ${dto.code} 的该版本已存在（可能有人同时发布了同一模板），请刷新后重试`,
          ERROR_CODES.INVALID_STATUS_TRANSITION,
        );
      }
      throw error;
    }
    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'template.create',
      targetType: 'measurement_template',
      targetId: saved.id,
      after: { code: saved.code, version: saved.version, status: saved.status },
      ip: null,
    });
    return this.toDto(saved);
  }

  async update(
    id: string,
    dto: MeasurementTemplateUpsertRequest,
    admin: AdminPrincipal,
  ): Promise<MeasurementTemplateDto> {
    const template = await this.repo.findOne({ where: { id } });
    if (!template) throw BusinessException.notFound('量体模板不存在');
    if (template.status !== TemplateStatus.DRAFT) {
      throw BusinessException.conflict(
        '已发布或已归档的模板不能原地修改，请发布新版本',
        'INVALID_STATUS_TRANSITION',
      );
    }

    /*
     * 客户端回传了「我打开时看到的行版本」→ 与库里的现况不符就是有人改过。
     *
     * 下面 WHERE 里的 rowVersion 只能挡住「两个请求在同一瞬间重叠」：
     * 商家 A 打开编辑表单 → 商家 B 改完保存 → A 十分钟后保存，
     * A 手里是**整行陈旧内容**，会把 B 的量体字段静默覆盖，而 A 拿到的是 200。
     * 所以客户端把打开时看到的行版本带回来，这里先做一次比对，不一致就 409。
     *
     * 不传 expectedVersion 时保持原行为（服务端读到什么版本就写什么版本）。
     */
    if (dto.expectedVersion !== undefined && dto.expectedVersion !== template.rowVersion) {
      throw BusinessException.conflict(
        '该模板已被他人修改，请刷新后重试',
        ERROR_CODES.VERSION_CONFLICT,
      );
    }

    /*
     * 条件更新（乐观锁），而不是 save(整行实体)。
     *
     * 为什么不用 save：save 会把「读到的整行快照」原样写回 ——
     * 两个管理员同时编辑同一份草稿时，后写者拿着陈旧快照**静默覆盖**先写者，
     * 量体字段被回退，而调用方拿到 200 毫无提示。
     *
     * 为什么 WHERE 里还要带 status：上面的「只有 DRAFT 可改」是**读时**检查，
     * 写入时可能已被别人发布/归档 —— 典型的 TOCTOU。
     * 把 status 一起写进 WHERE，判断与写入才是原子的。
     */
    const result = await this.repo.update(
      { id, rowVersion: template.rowVersion, status: TemplateStatus.DRAFT },
      {
        name: dto.name,
        applicableCategories: dto.applicableCategories ?? [],
        summary: dto.summary ?? null,
        measurementSections: dto.measurementSections ?? [],
      },
    );
    if (result.affected !== 1) {
      throw BusinessException.conflict(
        '该模板已被他人修改，请刷新后重试',
        ERROR_CODES.VERSION_CONFLICT,
      );
    }

    // 条件更新不返回实体，回读一次拿到最新行（含自增后的行版本）
    const saved = await this.repo.findOne({ where: { id } });
    if (!saved) throw BusinessException.notFound('量体模板不存在');
    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'template.update',
      targetType: 'measurement_template',
      targetId: saved.id,
      after: { code: saved.code, version: saved.version },
      ip: null,
    });
    return this.toDto(saved);
  }

  /**
   * 删除模板。
   *
   * 背景：此前后台**没有**删除模板的入口 ——
   * 商家建错了模板只能留着（量体模板列表里会一直挂着这些垃圾），
   * 而「发布新版本」也解决不了「这个模板压根不该存在」。
   *
   * 允许删除 DRAFT / ARCHIVED / ACTIVE：
   * 商家可能建错并已经发布，此时没有别的入口能把它清掉。
   *
   * 硬约束：模板被商品引用时不能删 ——
   * 删掉后商品解析不到量体模板，顾客端提交定制申请时会被服务端拒收，
   * 等于把一个模板问题变成了一批订单问题。
   */
  async remove(id: string, admin: AdminPrincipal): Promise<void> {
    const template = await this.repo.findOne({ where: { id } });
    if (!template) throw BusinessException.notFound('量体模板不存在');

    const before = {
      code: template.code,
      name: template.name,
      version: template.version,
      status: template.status,
    };

    /*
     * 引用检查与删除放在同一个事务里：
     * 「有多少商品在用」与「删掉模板」必须原子，
     * 否则删完之后又有人把商品绑上来，同样会留下解析不到模板的商品。
     */
    await this.dataSource.transaction(async (manager) => {
      /*
       * 这里直接查 products 表，不走 Product 实体仓储 ——
       * 商品实体正在被别的改动触碰，模板服务不应该和它耦合。
       */
      const rows: Array<{ cnt: string | number }> = await manager.query(
        'SELECT COUNT(*) AS cnt FROM `products` WHERE `measurementTemplateId` = ?',
        [id],
      );
      const referenced = Number(rows?.[0]?.cnt ?? 0);
      if (referenced > 0) {
        throw BusinessException.conflict(
          `该模板已被 ${referenced} 件商品引用，不能删除`,
          ERROR_CODES.INVALID_STATUS_TRANSITION,
        );
      }
      await manager.getRepository(MeasurementTemplate).delete({ id });
    });

    // 审计写在事务外：审计失败不阻断主业务（沿用本模块既有约定）
    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'template.delete',
      targetType: 'measurement_template',
      targetId: id,
      before,
      ip: null,
    });
  }

  /**
   * 发布。草稿 → ACTIVE；已 ACTIVE 的模板再次发布会**创建新版本**并把旧版本归档，
   * 保证历史申请引用的模板版本永远可回溯。
   */
  async publish(id: string, admin: AdminPrincipal): Promise<MeasurementTemplateDto> {
    const template = await this.repo.findOne({ where: { id } });
    if (!template) throw BusinessException.notFound('量体模板不存在');

    if (template.status === TemplateStatus.ACTIVE) {
      const sibling = await this.repo.findOne({
        where: { code: template.code, version: template.version },
      });
      if (!sibling) throw BusinessException.notFound('量体模板不存在');

      const next = this.repo.create({
        code: template.code,
        name: template.name,
        version: template.version + 1,
        status: TemplateStatus.ACTIVE,
        applicableCategories: template.applicableCategories,
        summary: template.summary,
        measurementSections: template.measurementSections,
      });
      /*
       * 归档旧版本 + 建新版本放在一个事务里：
       * 中途失败不能留下「一个 ACTIVE 都没有」的空档。
       * 并发发布由唯一索引 (code, version) 兜底 → 翻译成 409。
       */
      let created: MeasurementTemplate;
      try {
        created = await this.dataSource.transaction(async (manager) => {
          await this.archiveActive(template.code, manager);
          return manager.getRepository(MeasurementTemplate).save(next);
        });
      } catch (error) {
        if (isDuplicateKey(error)) {
          throw BusinessException.conflict(
            '该模板已被并发发布，请刷新后重试',
            ERROR_CODES.INVALID_STATUS_TRANSITION,
          );
        }
        throw error;
      }
      await this.audit.record({
        actorId: admin.id,
        actorName: admin.displayName,
        actorRole: admin.role,
        action: 'template.publish.new_version',
        targetType: 'measurement_template',
        targetId: created.id,
        after: { code: created.code, version: created.version },
        ip: null,
      });
      return this.toDto(created);
    }

    let saved: MeasurementTemplate;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        await this.archiveActive(template.code, manager);
        template.status = TemplateStatus.ACTIVE;
        return manager.getRepository(MeasurementTemplate).save(template);
      });
    } catch (error) {
      if (isDuplicateKey(error)) {
        throw BusinessException.conflict(
          '该模板已被并发发布，请刷新后重试',
          ERROR_CODES.INVALID_STATUS_TRANSITION,
        );
      }
      throw error;
    }
    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'template.publish',
      targetType: 'measurement_template',
      targetId: saved.id,
      after: { code: saved.code, version: saved.version, status: saved.status },
      ip: null,
    });
    return this.toDto(saved);
  }

  private async archiveActive(code: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(MeasurementTemplate) : this.repo;
    const actives = await repo.find({ where: { code, status: TemplateStatus.ACTIVE } });
    for (const item of actives) {
      item.status = TemplateStatus.ARCHIVED;
      await repo.save(item);
    }
  }

  private toDto(row: MeasurementTemplate): MeasurementTemplateDto {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      version: row.version,
      /** 行版本（乐观锁）：与上面的业务 version 不是一回事，改一次就 +1 */
      rowVersion: row.rowVersion,
      status: row.status,
      applicableCategories: (row.applicableCategories ?? []) as string[],
      summary: row.summary,
      // 读路径归一化：历史行可能是原型 snake_case 形状，
      // 不归一化的话顾客端拿到的是 undefined 字段，量体表单会渲染为空。
      measurementSections: toMeasurementSections(row.measurementSections) as never,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
