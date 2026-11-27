import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * 分页查询基类。
 *
 * 背景（本轮安全审计 P1-5）：此前列表查询直接用 `packages/contracts` 里的
 * **interface** 接收 query，而 interface 在运行时是 `Object`，
 * Nest 的 ValidationPipe 对它不做任何校验与转换。
 * 于是 `?page=abc` 会变成 `NaN`，`Math.max(1, NaN)` 仍是 `NaN`，
 * `skip(NaN).take(NaN)` 可能不生成 LIMIT —— 一次把整表连同
 * 顾客手机号、地址、量体明细全部倒出来。
 *
 * 现在所有列表查询改用 class DTO：page / pageSize 被强制转换成
 * 区间内的整数，非法值直接 400，而不是悄悄退化成全表返回。
 */
export class PaginationQueryDto {
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
