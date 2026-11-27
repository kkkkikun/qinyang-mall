import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { Trim, TrimNullable } from '../../../common/decorators/trim.decorator';

/**
 * 顾客「确认报价」的请求体。
 *
 * 此前这里直接用 `@qinyang/contracts` 里的 **interface**：
 * interface 在运行时是 `Object`，Nest 的 ValidationPipe 会**整体跳过**校验，
 * 于是 `POST /customization-requests/:id/confirm-quote` 传 `{}` 也不报错，
 * `quoteId` 是 undefined、`expectedVersion` 是 undefined ——
 * 报价 id 形同虚设，版本冲突也被报成 409 而不是 400。
 *
 * 所有 `@Body()` 的运行时类型必须是 class DTO（由 route-coverage 守卫守住）。
 */
export class QuoteConfirmDto {
  @ApiProperty({ description: '顾客要确认的报价 id' })
  @IsString()
  @IsUUID('4')
  @Trim()
  quoteId!: string;

  @ApiProperty({ description: '顾客看到的报价版本号；与当前版本不符返回 QUOTE_VERSION_CONFLICT' })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

/** 顾客「拒绝报价」的请求体 */
export class QuoteRejectDto extends QuoteConfirmDto {
  @ApiPropertyOptional({ description: '拒绝理由（可选），会随审计留存' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @TrimNullable()
  reason?: string | null;
}
