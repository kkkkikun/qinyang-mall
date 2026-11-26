import { PricingMode, ProductStatus } from '@qinyang/contracts';
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
 * 商品。
 * - 价格以整数分存储；`pricingMode = QUOTE_ONLY` 时 `priceCents` 恒为 null，
 *   客户端必须显示「待报价」，不得展示 0 或编造价格。
 * - 正式名称、材质、售价等经营数据需商家确认后才能发布，状态机 DRAFT → PENDING_REVIEW → PUBLISHED。
 */
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subtitle: string | null;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  categoryId: string;

  @Column({ type: 'varchar', length: 16, default: PricingMode.QUOTE_ONLY })
  pricingMode: PricingMode;

  /** 整数分。QUOTE_ONLY 模式为 null */
  @Column({ type: 'int', unsigned: true, nullable: true })
  priceCents: number | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  material: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  careGuide: string | null;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  measurementTemplateId: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Index()
  @Column({ type: 'varchar', length: 16, default: ProductStatus.DRAFT })
  status: ProductStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  createdById: string | null;

  @Column({ type: 'datetime', nullable: true })
  publishedAt: Date | null;

  @VersionColumn()
  version: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
