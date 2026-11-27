import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AdminRole,
  CustomizationRequestListQuery,
  QuoteCreateRequest,
  RequestStatus,
} from '@qinyang/contracts';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';
import { CustomizationService } from './customization.service';
import { QuoteService } from '../quote/quotes.service';
import { Trim, TrimNullable } from '../../common/decorators/trim.decorator';
import { CustomizationRequestQueryDto } from './dto/customization-request-query.dto';
import { RawResponse } from '../../common/decorators/raw-response.decorator';
import { buildContentDisposition, buildExportFilename } from '../../common/csv';

export class ReviewDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsIn(['APPROVE', 'REJECT'])
  action!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @TrimNullable()
  note?: string;
}

export class QuoteCreateDto implements QuoteCreateRequest {
  @ApiProperty({ description: '报价金额，整数分' })
  @IsInt()
  @Min(1)
  // 上限 1000 万元：数据库列是 int unsigned（最大约 2147 万元），
  // 再加上「amount + freight」要写进 orders.totalCents，超限会越界落库失败 → 500
  @Max(100_000_000)
  amountCents!: number;

  @ApiProperty({ description: '运费，整数分' })
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  freightCents!: number;

  @ApiPropertyOptional({ default: 'CNY' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiProperty({ description: '制作周期（天）' })
  @IsInt()
  @Min(0)
  productionDays!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  // 此前只校验「是字符串」：传 'not-a-date' 会 new Date() 成 Invalid Date，
  // 落库时炸成 500。这里按 ISO 日期串校验并拒绝非法格式。
  @IsDateString()
  @TrimNullable()
  validUntil?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @TrimNullable()
  note?: string | null;
}

export class RequestStatusDto {
  @ApiProperty({ enum: RequestStatus })
  @IsEnum(RequestStatus)
  status!: RequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;
}

@ApiTags('管理端 · 定制申请')
@ApiBearerAuth('admin')
@UseGuards(AdminAuthGuard, RolesGuard)
@Controller('admin/customization-requests')
export class CustomizationAdminController {
  constructor(
    private readonly service: CustomizationService,
    private readonly quotes: QuoteService,
  ) {}

  @Get()
  @ApiOperation({ summary: '申请列表' })
  list(@Query() query: CustomizationRequestQueryDto) {
    return this.service.listAdmin(query);
  }

  /**
   * 导出当前筛选结果为 CSV。
   *
   * 注意：必须声明在 `@Get(':id')` **之前** ——
   * Express 按注册顺序匹配路由，否则 "export" 会被当成申请 id。
   */
  @Get('export')
  @RawResponse()
  @ApiOperation({ summary: '导出定制申请 CSV（当前筛选条件）' })
  async export(@Query() query: CustomizationRequestQueryDto, @Res() res: Response): Promise<void> {
    const csv = await this.service.exportAdminCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', buildContentDisposition(buildExportFilename('定制申请')));
    res.send(csv);
  }

  @Get(':id')
  @ApiOperation({ summary: '申请详情（含量体资料与报价历史）' })
  get(@Param('id') id: string) {
    return this.service.getAdmin(id);
  }

  @Post(':id/review')
  @HttpCode(200)
  @ApiOperation({ summary: '审核申请：通过 / 谢绝' })
  review(
    @Param('id') id: string,
    @Body() dto: ReviewDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.service.review(id, dto.action, dto.note, admin);
  }

  @Put(':id/status')
  @HttpCode(200)
  @ApiOperation({ summary: '变更申请状态' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: RequestStatusDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.service.changeStatus(id, dto.status, dto.note, admin);
  }

  @Get(':id/quotes')
  @ApiOperation({ summary: '报价历史版本' })
  quoteHistory(@Param('id') id: string) {
    return this.quotes.listByRequest(id);
  }

  @Post(':id/quotes')
  @Roles(AdminRole.OWNER)
  @HttpCode(201)
  @ApiOperation({ summary: '创建报价（生成新版本，店主专属）' })
  createQuote(
    @Param('id') id: string,
    @Body() dto: QuoteCreateDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.quotes.create(id, dto, admin);
  }
}
