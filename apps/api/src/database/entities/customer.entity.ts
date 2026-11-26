import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 顾客。openid 来自微信登录；开发/测试环境允许 mock 登录，
 * 因此 openid 允许为空但同一 mock 标识必须唯一。
 */
@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  openid: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  unionid: string | null;

  @Column({ type: 'varchar', length: 64, default: '琴扬顾客' })
  nickname: string;

  /** 联系方式属敏感数据，不写入普通日志，不在公开接口返回明文 */
  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
