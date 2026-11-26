import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MeasurementField,
  MeasurementSection,
  MeasurementTemplateUpsertRequest,
  MeasurementType,
} from '@qinyang/contracts';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class TemplateFieldDto implements MeasurementField {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  fieldCode: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  fieldName: string;

  @ApiProperty({ enum: MeasurementType })
  @IsEnum(MeasurementType)
  measurementType: MeasurementType;

  @ApiProperty()
  @IsString()
  @MaxLength(16)
  unit: string;

  @ApiProperty()
  @IsBoolean()
  required: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tips?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  @MaxLength(64)
  sectionId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  title: string;

  @ApiProperty({ enum: MeasurementType })
  @IsEnum(MeasurementType)
  measurementType: MeasurementType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
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
  @MaxLength(64)
  code: string;

  @ApiProperty({ example: '针织上装 / 衬衫量体模板' })
  @IsString()
  @MaxLength(128)
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
  summary?: string | null;

  @ApiProperty({ type: 'array', description: 'MeasurementSection[]' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateSectionDto)
  measurementSections: TemplateSectionDto[];

  @ApiPropertyOptional({ description: '创建时直接发布' })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
