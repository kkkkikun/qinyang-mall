import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MediaRole,
  PricingMode,
  ProductStatus,
} from '@qinyang/contracts';
import { Type } from 'class-transformer';
import { Trim, TrimNullable } from '../../../common/decorators/trim.decorator';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class ProductUpsertDto {
  @ApiProperty({ example: 'ED-0032' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  @Trim()
  code: string;

  @ApiProperty({ example: '藏青针织水手领开衫' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Trim()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @TrimNullable()
  subtitle?: string | null;

  @ApiProperty()
  @IsString()
  categoryId: string;

  @ApiProperty({ enum: PricingMode, default: PricingMode.QUOTE_ONLY })
  @IsEnum(PricingMode)
  pricingMode: PricingMode;

  @ApiPropertyOptional({ description: '整数分；QUOTE_ONLY 模式必须为 null' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000000)
  priceCents?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  // 与数据库列长度对齐：此前**没有上限**，超长会在落库时变成
  // 「Data too long for column」→ 500，而不是可读的 400
  @MaxLength(128)
  @TrimNullable()
  material?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @TrimNullable()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @TrimNullable()
  careGuide?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(36)
  @Trim()
  measurementTemplateId?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  // 注意：这里刻意**不**接受 status。
  // 新增商品一律草稿，上下架只能走 POST /admin/products/:id/status（店主专属）。
  // 接受 status 会让店员绕过店主审核直接上架。
}

export class ProductStatusDto {
  @ApiProperty({ enum: ProductStatus })
  @IsEnum(ProductStatus)
  status: ProductStatus;
}

export class ProductMediaUpsertDto {
  @ApiProperty({ enum: MediaRole })
  @IsEnum(MediaRole)
  role: MediaRole;

  @ApiProperty({ example: 'products/ED-0032/cover-1x1.jpg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Trim()
  storageKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Trim()
  url?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  width?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  height?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bytes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @TrimNullable()
  alt?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class ProductMediaUpdateDto {
  @ApiPropertyOptional({ enum: MediaRole })
  @IsOptional()
  @IsEnum(MediaRole)
  role?: MediaRole;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @TrimNullable()
  alt?: string | null;
}

export class ProductBatchStatusDto {
  @ApiProperty({ description: '要批量变更的商品 id 列表', example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids!: string[];

  @ApiProperty({ enum: ProductStatus })
  @IsEnum(ProductStatus)
  status!: ProductStatus;
}

/**
 * 商品 CSV 批量导入请求。
 *
 * 前端读取本地文件后把**文本**提交上来（不走 multipart），
 * 服务端按 RFC 4180 解析。
 */
export class ProductImportDto {
  @ApiProperty({ description: 'CSV 文本（含表头行）', maxLength: 2000000 })
  @IsString()
  @MaxLength(2000000)
  csv!: string;

  @ApiPropertyOptional({ default: false, description: '只校验不落库（预检）' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class ProductListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Trim()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(36)
  @Trim()
  categoryId?: string;

  @ApiPropertyOptional({ description: '二级分组 code，例如 knitwear-cardigan' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Trim()
  group?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ enum: PricingMode })
  @IsOptional()
  @IsEnum(PricingMode)
  pricingMode?: PricingMode;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class UploadQueryDto {
  @ApiPropertyOptional({ enum: MediaRole, default: MediaRole.DETAIL })
  @IsOptional()
  @IsEnum(MediaRole)
  role?: MediaRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  productCode?: string;
}

export class UrlFieldDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Length(0, 255)
  @TrimNullable()
  alt?: string | null;
}
