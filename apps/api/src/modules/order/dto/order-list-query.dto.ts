import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@qinyang/contracts';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

/** 订单列表查询（管理端与顾客端共用） */
export class OrderListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: '订单号或申请 id 模糊匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  keyword?: string;
}
