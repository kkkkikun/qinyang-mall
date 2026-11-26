import { TemplateStatus } from '@qinyang/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 量体模板（版本化）。
 * 同一个 `code` 允许多个版本；同一时刻只有一个 ACTIVE 版本。
 * 已发布模板不可原地修改，修改需新建版本并把旧版本置 ARCHIVED。
 */
@Entity('measurement_templates')
export class MeasurementTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Index()
  @Column({ type: 'varchar', length: 16, default: TemplateStatus.DRAFT })
  status: TemplateStatus;

  /** 适用的一级/二级分类 id 列表 */
  @Column({ type: 'json', nullable: true })
  applicableCategories: string[] | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  summary: string | null;

  /** MeasurementSection[] 结构，与 contracts 定义一致 */
  @Column({ type: 'json' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  measurementSections: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
