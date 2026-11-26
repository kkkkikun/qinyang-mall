import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GuidePage } from '../../database/entities/guide-page.entity';
import { BusinessException } from '../../common/errors/business.exception';

export interface GuideSection {
  id: string;
  title: string;
  /** 段落说明 */
  description?: string;
  /** 要点条目，逐条渲染 */
  items: string[];
  /** 配图（量体示意图等） */
  illustration?: string | null;
  /** 关联的量体字段编码 */
  fieldCodes: string[];
}

export interface GuidePageDto {
  slug: string;
  title: string;
  summary: string | null;
  sections: GuideSection[];
  updatedAt: string;
}

@Injectable()
export class GuidesService {
  constructor(
    @InjectRepository(GuidePage)
    private readonly repo: Repository<GuidePage>,
  ) {}

  async get(slug: string): Promise<GuidePageDto> {
    const page = await this.repo.findOne({ where: { slug, status: 'ACTIVE' } });
    if (!page) throw BusinessException.notFound('图文说明不存在');
    return this.toDto(page);
  }

  async listAll(): Promise<GuidePageDto[]> {
    const rows = await this.repo.find({ order: { sortOrder: 'ASC' } });
    return rows.map((row) => this.toDto(row));
  }

  async update(
    slug: string,
    payload: { title?: string; summary?: string | null; sections?: GuideSection[] },
  ): Promise<GuidePageDto> {
    const page = await this.repo.findOne({ where: { slug } });
    if (!page) throw BusinessException.notFound('图文说明不存在');
    if (payload.title !== undefined) page.title = payload.title;
    if (payload.summary !== undefined) page.summary = payload.summary;
    if (payload.sections !== undefined) page.sections = payload.sections;
    const saved = await this.repo.save(page);
    return this.toDto(saved);
  }

  private toDto(page: GuidePage): GuidePageDto {
    return {
      slug: page.slug,
      title: page.title,
      summary: page.summary,
      sections: (page.sections ?? []) as GuideSection[],
      updatedAt: page.updatedAt.toISOString(),
    };
  }
}
