import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MeasurementTemplateDto,
  MeasurementTemplateUpsertRequest,
  TemplateStatus,
} from '@qinyang/contracts';

import { MeasurementTemplate } from '../../database/entities/measurement-template.entity';
import { Category } from '../../database/entities/category.entity';
import { BusinessException } from '../../common/errors/business.exception';
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

    if (dto.publish) {
      await this.archiveActive(dto.code);
    }

    const saved = await this.repo.save(entity);
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

    template.name = dto.name;
    template.applicableCategories = dto.applicableCategories ?? [];
    template.summary = dto.summary ?? null;
    template.measurementSections = dto.measurementSections ?? [];

    const saved = await this.repo.save(template);
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

      await this.archiveActive(template.code);

      const next = this.repo.create({
        code: template.code,
        name: template.name,
        version: template.version + 1,
        status: TemplateStatus.ACTIVE,
        applicableCategories: template.applicableCategories,
        summary: template.summary,
        measurementSections: template.measurementSections,
      });
      const created = await this.repo.save(next);
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

    await this.archiveActive(template.code);
    template.status = TemplateStatus.ACTIVE;
    const saved = await this.repo.save(template);
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

  private async archiveActive(code: string): Promise<void> {
    const actives = await this.repo.find({ where: { code, status: TemplateStatus.ACTIVE } });
    for (const item of actives) {
      item.status = TemplateStatus.ARCHIVED;
      await this.repo.save(item);
    }
  }

  private toDto(row: MeasurementTemplate): MeasurementTemplateDto {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      version: row.version,
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
