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

  @Index()
  @Column({ type: 'varchar', length: 36 })
  requestId: string;

  @Column({ type: 'int' })
  version: number;

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
