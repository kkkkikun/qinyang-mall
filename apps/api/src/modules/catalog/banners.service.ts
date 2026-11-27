import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BannerDto, BannerReorderRequest, BannerUpsertRequest, ERROR_CODES } from '@qinyang/contracts';
import { DataSource, LessThan, MoreThan, Repository } from 'typeorm';
import { Banner } from '../../database/entities/banner.entity';
import { BusinessException } from '../../common/errors/business.exception';
import { AuditService } from '../audit/audit.service';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';

@Injectable()
export class BannersService {
  constructor(
    @InjectRepository(Banner)
    private readonly banners: Repository<Banner>,
    private readonly dataSource: DataSource,
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

    /*
     * 客户端回传了「我打开时看到的行版本」→ 与库里的现况不符就是有人改过。
     *
     * 下面 WHERE 里的 version 只能挡住「两个请求在同一瞬间重叠」：
     * 商家 A 打开编辑表单 → 商家 B 改完保存 → A 十分钟后保存，
     * A 手里是**整行陈旧内容**，会把 B 的改动静默覆盖，而 A 拿到的是 200。
     * 所以客户端把打开时看到的版本带回来，这里先做一次比对，不一致就 409。
     *
     * 不传 expectedVersion 时保持原行为（服务端读到什么版本就写什么版本），
     * CSV 导入等不带版本号的路径不受影响。
     */
    if (dto.expectedVersion !== undefined && dto.expectedVersion !== banner.version) {
      throw BusinessException.conflict(
        '该轮播已被他人修改，请刷新后重试',
        ERROR_CODES.VERSION_CONFLICT,
      );
    }

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
        ERROR_CODES.VERSION_CONFLICT,
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

  /**
   * 轮播重排。
   *
   * 只接受 **id 顺序**，服务端据此重写 `sortOrder`：
   *
   * - **不整行回写**：早期做法是逐条 `PUT /admin/banners/:id` 改排序，
   *   而那个接口是整行保存 —— 商家 A 刚改了标题，商家 B 接着点「下移」，
   *   B 手里那份**旧快照**会把 A 的标题改回去（写入者毫无察觉，还拿到 200）。
   * - **不产生半成品**：逐条更新中途失败会留下「一半新顺序、一半旧顺序」；
   *   这里在一个事务里改完，要么全成，要么全不成。
   * - **期间新增的轮播不丢**：不在给定顺序里的轮播按现有次序追加到末尾。
   */
  async reorder(dto: BannerReorderRequest, admin: AdminPrincipal): Promise<BannerDto[]> {
    const ids = dto.ids ?? [];
    if (ids.length === 0) {
      throw BusinessException.badRequest('排序列表不能为空');
    }
    if (new Set(ids).size !== ids.length) {
      throw BusinessException.badRequest('排序列表里有重复的轮播');
    }

    const all = await this.banners.find({
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const known = new Set(all.map((row) => row.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw BusinessException.notFound('轮播不存在');
    }

    const ordered = [
      ...ids.map((id) => all.find((row) => row.id === id)!),
      ...all.filter((row) => !ids.includes(row.id)),
    ];

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Banner);
      for (let i = 0; i < ordered.length; i += 1) {
        const row = ordered[i];
        if (row.sortOrder === i) continue;
        /*
         * 条件更新：WHERE 里带上读取时的行版本。
         * 期间有人改过这条轮播（标题/启停）→ 影响行数为 0 → 409，
         * 而不是把对方的改动覆盖掉。
         */
        const result = await repo.update({ id: row.id, version: row.version }, { sortOrder: i });
        if (result.affected !== 1) {
          throw BusinessException.conflict(
            '轮播已被他人修改，请刷新后重试',
            ERROR_CODES.VERSION_CONFLICT,
          );
        }
      }
    });

    await this.audit.record({
      actorId: admin.id,
      actorName: admin.displayName,
      actorRole: admin.role,
      action: 'banner.reorder',
      targetType: 'banner',
      targetId: null,
      after: { order: ordered.map((row) => row.id) },
      ip: null,
    });

    return this.listAll();
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
      /** 行版本（乐观锁）：编辑时回传，服务端据此判断「期间是否被人改过」 */
      version: banner.version,
    };
  }
}
