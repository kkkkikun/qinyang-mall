import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BannerDto, BannerUpsertRequest } from '@qinyang/contracts';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { Banner } from '../../database/entities/banner.entity';
import { BusinessException } from '../../common/errors/business.exception';
import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';

@Injectable()
export class BannersService {
  constructor(
    @InjectRepository(Banner)
    private readonly banners: Repository<Banner>,
    private readonly audit: AuditService,
  ) {}

  /** 顾客端：仅返回启用且在投放期内的轮播 */
  async listActive(): Promise<BannerDto[]> {
    const now = new Date();
    const rows = await this.banners.find({
      where: [{ status: 'ACTIVE' }],
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return rows
      .filter(
        (row) =>
          (!row.startAt || row.startAt <= now) && (!row.endAt || row.endAt >= now),
      )
      .map((row) => this.toDto(row));
  }

  async listAll(): Promise<BannerDto[]> {
    const rows = await this.banners.find({
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return rows.map((row) => this.toDto(row));
  }

  async create(dto: BannerUpsertRequest, admin: AdminPrincipal): Promise<BannerDto> {
    const entity = this.banners.create({
      title: dto.title,
      imageUrl: dto.imageUrl,
      storageKey: dto.storageKey ?? null,
      linkType: dto.linkType,
      linkValue: dto.linkValue ?? null,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? 'ACTIVE',
      startAt: dto.startAt ? new Date(dto.startAt) : null,
      endAt: dto.endAt ? new Date(dto.endAt) : null,
    });
    const saved = await this.banners.save(entity);
    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'banner.create',
      targetType: 'banner',
      targetId: saved.id,
      after: { title: saved.title, sortOrder: saved.sortOrder },
      ip: null,
    });
    return this.toDto(saved);
  }

  async update(
    id: string,
    dto: BannerUpsertRequest,
    admin: AdminPrincipal,
  ): Promise<BannerDto> {
    const banner = await this.banners.findOne({ where: { id } });
    if (!banner) throw BusinessException.notFound('轮播不存在');

    const before = { title: banner.title, sortOrder: banner.sortOrder, status: banner.status };
    banner.title = dto.title;
    banner.imageUrl = dto.imageUrl;
    banner.storageKey = dto.storageKey ?? banner.storageKey;
    banner.linkType = dto.linkType;
    banner.linkValue = dto.linkValue ?? null;
    banner.sortOrder = dto.sortOrder ?? banner.sortOrder;
    banner.status = dto.status ?? banner.status;
    banner.startAt = dto.startAt ? new Date(dto.startAt) : banner.startAt;
    banner.endAt = dto.endAt ? new Date(dto.endAt) : banner.endAt;
    const saved = await this.banners.save(banner);

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'banner.update',
      targetType: 'banner',
      targetId: saved.id,
      before,
      after: { title: saved.title, sortOrder: saved.sortOrder, status: saved.status },
      ip: null,
    });
    return this.toDto(saved);
  }

  async remove(id: string, admin: AdminPrincipal): Promise<void> {
    const banner = await this.banners.findOne({ where: { id } });
    if (!banner) throw BusinessException.notFound('轮播不存在');
    await this.banners.delete({ id });
    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'banner.delete',
      targetType: 'banner',
      targetId: id,
      before: { title: banner.title },
      ip: null,
    });
  }

  private toDto(banner: Banner): BannerDto {
    return {
      id: banner.id,
      title: banner.title,
      imageUrl: banner.imageUrl,
      linkType: banner.linkType,
      linkValue: banner.linkValue,
      sortOrder: banner.sortOrder,
      status: banner.status,
      startAt: banner.startAt ? banner.startAt.toISOString() : null,
      endAt: banner.endAt ? banner.endAt.toISOString() : null,
    };
  }
}
