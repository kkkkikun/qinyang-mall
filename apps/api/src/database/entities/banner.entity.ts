import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
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

  @Column({ type: 'varchar', length: 16, default: 'ACTIVE' })
  status: BannerStatus;

  @Column({ type: 'datetime', nullable: true })
  startAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  endAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
