import { ApiPropertyOptional } from '@nestjs/swagger';
import { RequestStatus } from '@qinyang/contracts';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** 定制申请列表查询（管理端与顾客端共用） */
export class CustomizationRequestQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: RequestStatus })
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @ApiPropertyOptional({ description: '申请编号模糊匹配' })
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
  productId?: string;
}
