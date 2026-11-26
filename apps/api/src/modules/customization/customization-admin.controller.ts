import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
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

export class ReviewDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsIn(['APPROVE', 'REJECT'])
  action!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;
}

export class QuoteCreateDto implements QuoteCreateRequest {
  @ApiProperty({ description: '报价金额，整数分' })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiProperty({ description: '运费，整数分' })
  @IsInt()
  @Min(0)
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
  validUntil?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
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
  list(@Query() query: CustomizationRequestListQuery) {
    return this.service.listAdmin(query);
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

@ApiTags('管理端 · 报价')
@ApiBearerAuth('admin')
@UseGuards(AdminAuthGuard, RolesGuard)
@Controller('admin/quotes')
export class QuotesAdminController {
  constructor(private readonly quotes: QuoteService) {}

  @Post(':id/withdraw')
  @Roles(AdminRole.OWNER)
  @HttpCode(200)
  @ApiOperation({ summary: '撤回当前有效报价（店主专属）' })
  withdraw(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal) {
    return this.quotes.withdraw(id, admin);
  }
}
