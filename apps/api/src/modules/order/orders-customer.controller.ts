import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderListQuery } from '@qinyang/contracts';
import { CustomerAuthGuard } from '../../common/guards/customer-auth.guard';
import { CurrentCustomer } from '../../common/decorators/customer.decorator';
import { OrdersService } from './orders.service';

@ApiTags('顾客端 · 订单')
@ApiBearerAuth('customer')
@UseGuards(CustomerAuthGuard)
@Controller('orders')
export class OrdersCustomerController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiOperation({ summary: '我的订单列表' })
  list(
    @Query() query: OrderListQuery,
    @CurrentCustomer('id') customerId: string,
  ) {
    return this.orders.listMine(customerId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '订单详情与进度' })
  get(@Param('id') id: string, @CurrentCustomer('id') customerId: string) {
    return this.orders.getMine(id, customerId);
  }
}
