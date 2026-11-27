import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { Trim } from '../../../common/decorators/trim.decorator';

/** 审计日志列表查询 */
export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '动作名，如 product.status.publish' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Trim()
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Trim()
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Trim()
  targetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Trim()
  actorId?: string;
}
