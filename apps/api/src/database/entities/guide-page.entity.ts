import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
