import { AdminRole } from '@qinyang/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * 审计日志。关键操作（改价、报价、订单状态、商品上下架）必须留痕。
 * `before` / `after` 只记录业务字段，不记录量体资料与联系方式明文。
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  actorName: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  actorRole: AdminRole | null;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  action: string;

  @Index()
  @Column({ type: 'varchar', length: 32 })
  targetType: string;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  targetId: string | null;

  @Column({ type: 'json', nullable: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  before: any;

  @Column({ type: 'json', nullable: true })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  after: any;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
