import { OrderStatus } from '@qinyang/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** 订单状态流转事件（订单完整历史） */
@Entity('order_events')
export class OrderEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  @Column({ type: 'varchar', length: 16, nullable: true })
  fromStatus: OrderStatus | null;

  @Column({ type: 'varchar', length: 16 })
  toStatus: OrderStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  operatorId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  operatorName: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  note: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
