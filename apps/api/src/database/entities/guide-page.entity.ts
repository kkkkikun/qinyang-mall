import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

/**
 * 图文说明页（量体指南 / 洗护指南 / 材质定制说明）。
 * 内容由商家在后台维护，顾客端只读。
 */
@Entity('guide_pages')
export class GuidePage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  slug: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  summary: string | null;

  /** GuideSection[]：{ id, title, body, mediaUrl? } */
  @Column({ type: 'json' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sections: any;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: 'ACTIVE' | 'DISABLED';

  /*
   * 行版本（乐观锁）。
   *
   * 这一页是**顾客直接看到**的内容，两个管理员同时编辑时，
   * 后写者拿着陈旧快照写回会把先写者写好的整套说明静默回退。
   * 更新一律走条件更新 `WHERE id = ? AND version = ?`，
   * 影响行数不为 1 → 409。
   *
   * 注意：TypeORM 的 `save()` **不做**乐观锁校验（只在 SET 里把 version 加 1），
   * 所以必须用 `update()` 的条件更新，不能靠 save() 抛异常。
   */
  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
