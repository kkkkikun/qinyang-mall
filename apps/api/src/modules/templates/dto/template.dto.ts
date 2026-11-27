import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MeasurementField,
  MeasurementSection,
  MeasurementTemplateUpsertRequest,
  MeasurementType,
} from '@qinyang/contracts';
import { Type } from 'class-transformer';
import { Trim, TrimNullable } from '../../../common/decorators/trim.decorator';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class TemplateFieldDto implements MeasurementField {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Trim()
  fieldCode: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Trim()
  fieldName: string;

  @ApiProperty({ enum: MeasurementType })
  @IsEnum(MeasurementType)
  measurementType: MeasurementType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  @Trim()
  unit: string;

  @ApiProperty()
  @IsBoolean()
  required: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @TrimNullable()
  instruction?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  tips?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @TrimNullable()
  illustration?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  min?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  max?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsNumber()
  step?: number | null;
}

export class TemplateSectionDto implements MeasurementSection {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Trim()
  sectionId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Trim()
  title: string;

  @ApiProperty({ enum: MeasurementType })
  @IsEnum(MeasurementType)
  measurementType: MeasurementType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @TrimNullable()
  description?: string;

  @ApiProperty({ type: 'array', description: 'MeasurementField[]' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateFieldDto)
  measurementFields: TemplateFieldDto[];
}

export class TemplateUpsertDto implements MeasurementTemplateUpsertRequest {
  @ApiProperty({ example: 'TPL-KNIT-TOPS' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Trim()
  code: string;

  @ApiProperty({ example: '针织上装 / 衬衫量体模板' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Trim()
  name: string;

  @ApiProperty({ type: [String], example: ['knitwear', 'shirts'] })
  @IsArray()
  @ArrayMaxSize(32)
  @IsString({ each: true })
  applicableCategories: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @TrimNullable()
  summary?: string | null;

  @ApiProperty({ type: 'array', description: 'MeasurementSection[]' })
  @IsArray()
  // 与 applicableCategories 的口径一致：数组必须有上限，
  // 否则超长内容进 JSON 列 → 落库失败 500
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => TemplateSectionDto)
  measurementSections: TemplateSectionDto[];

  @ApiPropertyOptional({ description: '创建时直接发布' })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;

  /**
   * 期望的行版本（来自列表/详情返回的 `rowVersion`）。
   *
   * 传了就做严格比对：期间被人改过 → 409，不覆盖别人的改动；
   * 不传则退化为现有行为（服务端读到什么版本就写什么版本）。
   */
  @ApiPropertyOptional({ description: '期望的行版本；与当前不一致返回 409' })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
