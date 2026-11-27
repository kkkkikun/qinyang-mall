import { TemplateStatus } from '@qinyang/contracts';
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

  /**
   * 乐观锁行版本（**不是**上面那个 `version`）。
   *
   * 业务 `version` 是「第几个发布版本」：由发布动作递增，
   * 并参与唯一索引 `UQ_measurement_templates_code_version`。
   * 编辑一份草稿不应该改变发布版本号 —— 否则草稿会占掉下一个发布版本号，
   * 发布时与唯一索引撞车。
   *
   * 因此行版本单独用 `rowVersion`：改动一次递增一次，
   * 管理端更新改为条件更新（`WHERE id = ? AND rowVersion = ?`）后，
   * 两个管理员同时编辑同一份模板时，后写者拿到 409 而不是静默覆盖先写者。
   */
  @VersionColumn()
  rowVersion: number;

  /*
   * 数据库另有两个**未映射**的列（见迁移 AddTemplateConstraints）：
   * - `activeCode` 生成列：ACTIVE 时等于 code，否则 NULL；
   *   配合唯一索引保证「同一模板 code 同时只有一个 ACTIVE」。
   * - 唯一索引 `(code, version)`：并发发布不会算出同一个版本号。
   *
   * 与报价的 `activeRequestId` 同一套做法：唯一性由数据库裁决。
   */

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
