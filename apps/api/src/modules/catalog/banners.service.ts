import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BannerDto, BannerUpsertRequest, ERROR_CODES } from '@qinyang/contracts';
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

    /*
     * 条件更新（乐观锁），而不是 save(整行实体)。
     *
     * save 会把读到的整行快照写回 —— 两个管理员同时编辑同一条轮播时，
     * 后写者会用陈旧快照**静默覆盖**先写者（文案、图片、投放时间被回退），
     * 而调用方拿到 200 毫无提示。
     * WHERE 里带上 version：期间被别人改过 → 影响行数不为 1 → 409。
     */
    const result = await this.banners.update(
      { id, version: banner.version },
      {
        title: dto.title,
        imageUrl: dto.imageUrl,
        storageKey: dto.storageKey ?? banner.storageKey,
        linkType: dto.linkType,
        linkValue: dto.linkValue ?? null,
        sortOrder: dto.sortOrder ?? banner.sortOrder,
        status: dto.status ?? banner.status,
        startAt: dto.startAt ? new Date(dto.startAt) : banner.startAt,
        endAt: dto.endAt ? new Date(dto.endAt) : banner.endAt,
      },
    );
    if (result.affected !== 1) {
      throw BusinessException.conflict(
        '该轮播已被他人修改，请刷新后重试',
        ERROR_CODES.INVALID_STATUS_TRANSITION,
      );
    }

    // 条件更新不返回实体，回读一次拿到最新行（含自增后的行版本）
    const saved = await this.banners.findOne({ where: { id } });
    if (!saved) throw BusinessException.notFound('轮播不存在');

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
