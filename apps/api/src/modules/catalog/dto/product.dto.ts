import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MediaRole,
  PricingMode,
  ProductStatus,
} from '@qinyang/contracts';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
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
  @MaxLength(32)
  code: string;

  @ApiProperty({ example: '藏青针织水手领开衫' })
  @IsString()
  @MaxLength(128)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
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
  @MaxLength(128)
  material?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  careGuide?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  @MaxLength(255)
  storageKey: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
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

export class ProductListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ description: '二级分组 code，例如 knitwear-cardigan' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
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
  alt?: string | null;
}
