import { PaymentProvider, PaymentStatus } from '@qinyang/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 支付记录。V1 不启用真实支付，本表只用于记录「未启用」事实，
 * 不得写入伪造的已支付或退款记录。
 */
@Entity('payment_records')
export class PaymentRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  orderId: string;

  @Column({ type: 'varchar', length: 16, default: PaymentProvider.DISABLED })
  provider: PaymentProvider;

  @Column({ type: 'varchar', length: 20, default: PaymentStatus.DISABLED })
  status: PaymentStatus;

  @Column({ type: 'int', unsigned: true })
  amountCents: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  externalTradeId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
