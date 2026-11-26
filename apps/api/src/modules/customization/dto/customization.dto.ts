import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CustomizationRequestCreateRequest,
  CustomerContact,
  MeasurementFieldValue,
  MeasurementType,
} from '@qinyang/contracts';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MeasurementValueDto implements MeasurementFieldValue {
  @ApiProperty({ example: 'chest_bust' })
  @IsString()
  @MaxLength(64)
  fieldCode: string;

  @ApiProperty({ example: '胸围' })
  @IsString()
  @MaxLength(64)
  fieldName: string;

  @ApiProperty({ enum: MeasurementType, example: MeasurementType.BODY })
  @IsEnum(MeasurementType)
  measurementType: MeasurementType;

  @ApiProperty({ example: 'cm' })
  @IsString()
  @MaxLength(16)
  unit: string;

  @ApiProperty({ example: 92, nullable: true })
  @IsOptional()
  @IsNumber()
  value: number | null;
}

export class CustomerContactDto implements CustomerContact {
  @ApiProperty({ example: '张女士' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  name: string;

  @ApiProperty({ example: '13800000000' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(32)
  phone: string;

  @ApiProperty({ example: '内蒙古自治区 呼和浩特市' })
  @IsString()
  @MaxLength(128)
  region: string;

  @ApiProperty({ example: '赛罕区 XX 路 XX 号 3 单元 501' })
  @IsString()
  @MaxLength(255)
  detail: string;
}

export class CreateCustomizationRequestDto
  implements CustomizationRequestCreateRequest
{
  @ApiProperty()
  @IsString()
  @MaxLength(36)
  productId: string;

  @ApiProperty({ type: [MeasurementValueDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeasurementValueDto)
  measurements: MeasurementValueDto[];

  @ApiProperty({ type: CustomerContactDto })
  @ValidateNested()
  @Type(() => CustomerContactDto)
  contact: CustomerContactDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string | null;

  @ApiProperty({ description: '幂等键：重复点击提交只产生一条申请' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  submitId: string;
}
