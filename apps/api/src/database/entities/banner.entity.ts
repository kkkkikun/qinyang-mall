import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

export type BannerStatus = 'ACTIVE' | 'DISABLED';
export type BannerLinkType = 'NONE' | 'PRODUCT' | 'CATEGORY' | 'PAGE';

/** 首页轮播 */
@Entity('banners')
export class Banner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'varchar', length: 512 })
  imageUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  storageKey: string | null;

  @Column({ type: 'varchar', length: 16, default: 'NONE' })
  linkType: BannerLinkType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  linkValue: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  // 与迁移里的 IDX_banners_status 对齐：实体与迁移的索引漂移，
  // 一旦有人临时开 synchronize 或跑 schema:log，就会被建议删索引。
  @Index()
  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: BannerStatus;

  @Column({ type: 'datetime', nullable: true })
  startAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  endAt: Date | null;

  /**
   * 乐观锁行版本。
   *
   * 管理端更新此前是「先读后写 → save(整行实体)」，两个管理员同时编辑同一条轮播时，
   * 后写者会用陈旧快照**静默覆盖**先写者（文案、图片、投放时间被回退），
   * 而调用方拿到 200 毫无提示。
   * 改为条件更新（`WHERE id = ? AND version = ?`）后，
   * 版本不匹配会拿到 409 而不是覆盖。
   */
  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
