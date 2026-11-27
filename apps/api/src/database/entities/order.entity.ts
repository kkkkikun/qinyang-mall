import { OrderStatus } from '@qinyang/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 订单。顾客确认报价后生成，商品与量体快照在此固化，
 * 之后后台修改商品不会改变历史订单。
 */
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  orderNo: string;

  /**
   * 来源定制申请。
   *
   * 唯一索引：数据库层保证「一个申请只对应一张订单」。
   * 此前只靠应用层先查后写，两个店员并发建单会各插一条 → 顾客看到两条订单。
   */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36 })
  requestId: string;

  @Column({ type: 'varchar', length: 36 })
  quoteId: string;

  @Column({ type: 'int' })
  quoteVersion: number;

  @Index()
  @Column({ type: 'varchar', length: 16, default: OrderStatus.CONFIRMED })
  status: OrderStatus;

  @Column({ type: 'json' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  productSnapshot: any;

  @Column({ type: 'json' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  measurementSnapshot: any;

  @Column({ type: 'json' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contact: any;

  @Column({ type: 'varchar', length: 512, nullable: true })
  remark: string | null;

  @Column({ type: 'int', unsigned: true })
  amountCents: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  freightCents: number;

  @Column({ type: 'int', unsigned: true })
  totalCents: number;

  @Column({ type: 'varchar', length: 8, default: 'CNY' })
  currency: string;

  @Column({ type: 'int', default: 0 })
  productionDays: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  carrier: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  trackingNo: string | null;

  @Column({ type: 'datetime', nullable: true })
  shippedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
