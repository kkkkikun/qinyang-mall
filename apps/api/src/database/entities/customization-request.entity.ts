import { RequestStatus } from '@qinyang/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 定制申请（顾客提交的量体申请）。
 *
 * 隐私：`contact` 与 `measurementSnapshot` 属敏感数据，
 * 不得写入普通日志，公开接口不得跨顾客返回。
 */
@Entity('customization_requests')
export class CustomizationRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  requestNo: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  customerId: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  productId: string;

  /** 提交时的商品快照，保证历史申请不随商品变更而改变 */
  @Column({ type: 'json' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  productSnapshot: any;

  @Column({ type: 'varchar', length: 36 })
  templateId: string;

  @Column({ type: 'varchar', length: 128 })
  templateName: string;

  @Column({ type: 'int', default: 1 })
  templateVersion: number;

  @Column({ type: 'json' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  measurementSnapshot: any;

  @Column({ type: 'json' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contact: any;

  @Column({ type: 'varchar', length: 512, nullable: true })
  remark: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: RequestStatus.PENDING_REVIEW })
  status: RequestStatus;

  /** 幂等键：同一 submitId 重复提交只产生一条申请 */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  submitId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
