import { MediaRole } from '@qinyang/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 商品图集条目。`storageKey` 为受控文件存储中的对象键，不直接暴露磁盘路径 */
@Entity('product_media')
export class ProductMedia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * 所属商品。
   *
   * 与 `storageKey` 组成唯一索引：同一商品下同一个 storageKey 只能有一条图集记录。
   * 「追加图集」此前是「先查后写」，并发下两个店员会把同一张图插两次；
   * 唯一性下沉到数据库后由索引裁决（见迁移 AddProductMediaUniqueIndex）。
   */
  @Index('UQ_product_media_productId_storageKey', ['productId', 'storageKey'], { unique: true })
  @Index()
  @Column({ type: 'varchar', length: 36 })
  productId: string;

  @Column({ type: 'varchar', length: 20, default: MediaRole.DETAIL })
  role: MediaRole;

  @Column({ type: 'varchar', length: 255 })
  storageKey: string;

  @Column({ type: 'varchar', length: 512 })
  url: string;

  @Column({ type: 'int', default: 0 })
  width: number;

  @Column({ type: 'int', default: 0 })
  height: number;

  @Column({ type: 'int', unsigned: true, default: 0 })
  bytes: number;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  alt: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
