import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryDeepPartialEntity, Repository } from 'typeorm';
import {
  ERROR_CODES,
  GuideFieldDto,
  GuidePageDto,
  GuidePageUpsertRequest,
  GuideSectionDto,
  MeasurementSection,
  TemplateStatus,
} from '@qinyang/contracts';
import { GuidePage } from '../../database/entities/guide-page.entity';
import { MeasurementTemplate } from '../../database/entities/measurement-template.entity';
import { BusinessException } from '../../common/errors/business.exception';
import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';

/**
 * 图文说明页（量体指南 / 洗护指南 / 材质说明）。
 *
 * 顾客端只读；内容由商家在后台维护。
 *
 * 此前 `update()` 只被 `GuidesService` 自己调用 ——
 * **没有任何控制器暴露它**，于是这几页内容只能改种子数据，
 * 商家在后台改不了顾客看到的量体说明与洗护说明。
 */
@Injectable()
export class GuidesService {
  constructor(
    @InjectRepository(GuidePage)
    private readonly repo: Repository<GuidePage>,
    @InjectRepository(MeasurementTemplate)
    private readonly templateRepo: Repository<MeasurementTemplate>,
    private readonly audit: AuditService,
  ) {}

  async get(slug: string): Promise<GuidePageDto> {
    const page = await this.repo.findOne({ where: { slug, status: 'ACTIVE' } });
    if (!page) throw BusinessException.notFound('图文说明不存在');
    return this.toDto(page, await this.fieldIndex());
  }

  async listAll(): Promise<GuidePageDto[]> {
    const rows = await this.repo.find({ order: { sortOrder: 'ASC' } });
    const index = await this.fieldIndex();
    return rows.map((row) => this.toDto(row, index));
  }

  /**
   * 更新图文说明页。
   *
   * 只开放标题 / 摘要 / 分节内容三项：
   * `slug` 是路由标识，改了会让顾客端的链接失效；
   * `status`（启停）属于「上下架」性质的动作，交给 OWNER 单独处理。
   */
  async update(
    slug: string,
    payload: GuidePageUpsertRequest,
    admin: AdminPrincipal,
  ): Promise<GuidePageDto> {
    const page = await this.repo.findOne({ where: { slug } });
    if (!page) throw BusinessException.notFound('图文说明不存在');

    const before = { title: page.title, summary: page.summary };

    /*
     * 条件更新（乐观锁）：`WHERE id = ? AND version = ?`
     *
     * 两个管理员同时编辑同一页时，两边都会读到同一份内容并先后提交 ——
     * 若整行写回，后提交者会把先提交者写好的**整套说明**静默回退，
     * 而调用方拿到的是 200，没有任何提示。
     *
     * 由数据库裁决：affected !== 1 说明期间被别人改过 → 409。
     */
    const partial: QueryDeepPartialEntity<GuidePage> = {};
    if (payload.title !== undefined) partial.title = payload.title;
    if (payload.summary !== undefined) partial.summary = payload.summary;
    if (payload.sections !== undefined) {
      partial.sections = payload.sections as unknown as GuidePage['sections'];
    }

    const affected = await this.repo.update({ id: page.id, version: page.version }, partial);
    if (affected.affected !== 1) {
      throw BusinessException.conflict(
        '该图文说明页已被他人修改，请刷新后重试',
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    const saved = await this.repo.findOne({ where: { id: page.id } });
    if (!saved) throw BusinessException.notFound('图文说明不存在');

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'guide.update',
      targetType: 'guide_page',
      targetId: saved.id,
      before,
      after: { title: saved.title, summary: saved.summary },
      ip: null,
    });

    return this.toDto(saved, await this.fieldIndex());
  }

  /**
   * 量体字段索引：`fieldCode` → 示意图元数据。
   *
   * 来源是**已发布（ACTIVE）的量体模板** —— 示意图的名称、测量说明、
   * 要点和配图都归量体模板管，图文说明页只按 `fieldCodes` 引用，
   * 这样商家在「量体模板」里改了一次说明，两处展示就一致了。
   *
   * 若一个库还没有任何 ACTIVE 模板（刚初始化、模板还是草稿），
   * 退回使用全部模板，否则新建的图文说明页会一张图都解析不出来。
   */
  private async fieldIndex(): Promise<Map<string, GuideFieldDto>> {
    let rows = await this.templateRepo.find({
      where: { status: TemplateStatus.ACTIVE },
      // 排序必须确定：同一个 fieldCode 出现在多个模板时取第一个，
      // 不排序的话解析结果随数据库返回顺序漂移（顾客端示意图说明会时有时无）。
      order: { code: 'ASC', version: 'DESC' },
    });
    if (rows.length === 0) {
      rows = await this.templateRepo.find({ order: { code: 'ASC', version: 'DESC' } });
    }

    const index = new Map<string, GuideFieldDto>();
    for (const row of rows) {
      const sections = (row.measurementSections ?? []) as MeasurementSection[];
      for (const section of sections) {
        for (const field of section.measurementFields ?? []) {
          if (!field?.fieldCode || index.has(field.fieldCode)) continue;
          index.set(field.fieldCode, {
            fieldCode: field.fieldCode,
            fieldName: field.fieldName,
            measurementType: field.measurementType,
            instruction: field.instruction ?? '',
            tips: field.tips ?? [],
            illustration: field.illustration ?? null,
          });
        }
      }
    }
    return index;
  }

  private toDto(page: GuidePage, index: Map<string, GuideFieldDto>): GuidePageDto {
    const sections = ((page.sections ?? []) as GuideSectionDto[]).map((section) => {
      const codes = Array.isArray(section.fieldCodes) ? section.fieldCodes : [];
      const fields = codes
        .map((code) => index.get(code))
        .filter((field): field is GuideFieldDto => Boolean(field));
      return {
        ...section,
        items: Array.isArray(section.items) ? section.items : [],
        fieldCodes: codes,
        fields,
      };
    });

    return {
      slug: page.slug,
      title: page.title,
      summary: page.summary,
      sections,
      sortOrder: page.sortOrder,
      status: page.status,
      updatedAt: page.updatedAt.toISOString(),
    };
  }
}
