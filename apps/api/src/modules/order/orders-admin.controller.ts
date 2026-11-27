import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { OrderStatusUpdateRequest } from '@qinyang/contracts';
import {
  AdminRole,
  OrderCreateRequest,
  OrderListQuery,
  OrderStatus,
} from '@qinyang/contracts';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';
import { OrdersService } from './orders.service';
import { OrderListQueryDto } from './dto/order-list-query.dto';

export class OrderCreateDto implements OrderCreateRequest {
  @ApiProperty()
  @IsString()
  @MaxLength(36)
  requestId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(36)
  quoteId!: string;
}

export class OrderStatusDto implements OrderStatusUpdateRequest {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;
}

export class OrderShipDto {
  @ApiProperty({ example: '顺丰速运' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  carrier!: string;

  @ApiProperty({ example: 'SF0000000001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  trackingNo!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;
}

export class OrderCancelDto {
  @ApiProperty({ description: '取消原因，必填' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  note!: string;
}

@ApiTags('管理端 · 订单')
@ApiBearerAuth('admin')
@UseGuards(AdminAuthGuard, RolesGuard)
@Controller('admin/orders')
export class OrdersAdminController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: '订单列表' })
  list(@Query() query: OrderListQueryDto) {
    return this.orders.listAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: '订单详情（含完整历史）' })
  get(@Param('id') id: string) {
    return this.orders.getAdmin(id);
  }

  @Post()
  @Roles(AdminRole.OWNER)
  @HttpCode(201)
  @ApiOperation({ summary: '由已确认申请生成订单（店主专属）' })
  create(@Body() dto: OrderCreateDto, @CurrentAdmin() admin: AdminPrincipal) {
    return this.orders.create(dto, admin);
  }

  @Post(':id/status')
  @HttpCode(200)
  @ApiOperation({ summary: '更新制作状态' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: OrderStatusDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.orders.updateStatus(id, dto, admin);
  }

  @Post(':id/ship')
  @HttpCode(200)
  @ApiOperation({ summary: '填写物流并发货' })
  ship(
    @Param('id') id: string,
    @Body() dto: OrderShipDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.orders.ship(id, dto, admin);
  }

  @Post(':id/cancel')
  @Roles(AdminRole.OWNER)
  @HttpCode(200)
  @ApiOperation({ summary: '取消订单（店主专属，需填原因）' })
  cancel(
    @Param('id') id: string,
    @Body() dto: OrderCancelDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.orders.cancel(id, dto.note, admin);
  }
}
