import { QuoteStatus } from '@qinyang/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 报价（版本化）。
 * 同一申请同时只有一个 ACTIVE 版本；创建新版本时旧版本自动转 SUPERSEDED。
 * 商品与量体快照在报价创建时冻结，后续商品变更不影响既有报价与订单。
 */
@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 所属定制申请。
   *
   * 与 version 组成唯一索引：同一申请的同一版本号只能有一条报价
   * （版本号是「现有最大版本 +1」，并发下会算出相同值）。
   */
  @Index('UQ_quotes_requestId_version', ['requestId', 'version'], { unique: true })
  @Column({ type: 'varchar', length: 36 })
  requestId: string;

  @Column({ type: 'int' })
  version: number;

  /**
   * 报价状态。
   *
   * 数据库另有一个**未映射**的生成列 `activeRequestId`：
   * ACTIVE 时等于 requestId，否则为 NULL，并对其建唯一索引 ——
   * MySQL 不支持部分唯一索引，这是实现「同一申请同时只有一个有效报价」的办法。
   * 该列由数据库自行计算，**不能**出现在实体里（否则 INSERT 会报错）。
   */
  @Index()
  @Column({ type: 'varchar', length: 16, default: QuoteStatus.ACTIVE })
  status: QuoteStatus;

  /** 整数分 */
  @Column({ type: 'int', unsigned: true })
  amountCents: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  freightCents: number;

  @Column({ type: 'varchar', length: 8, default: 'CNY' })
  currency: string;

  /** 制作周期（天） */
  @Column({ type: 'int', default: 0 })
  productionDays: number;

  @Column({ type: 'datetime', nullable: true })
  validUntil: Date | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'json' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  productSnapshot: any;

  @Column({ type: 'json' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  measurementSnapshot: any;

  @Column({ type: 'varchar', length: 36 })
  createdById: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  createdByName: string | null;

  @Column({ type: 'datetime', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
