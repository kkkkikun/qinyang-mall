import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@qinyang/contracts';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaymentService } from './payment.service';

@ApiTags('管理端 · 支付')
@ApiBearerAuth('admin')
@UseGuards(AdminAuthGuard, RolesGuard)
@Controller('admin/orders')
export class PaymentAdminController {
  constructor(private readonly payments: PaymentService) {}

  @Get(':id/payment')
  @ApiOperation({ summary: '查询订单支付记录（V1 恒为未启用）' })
  async payment(@Param('id') id: string) {
    const record = await this.payments.findByOrder(id);
    return record
      ? {
          orderId: record.orderId,
          provider: record.provider,
          status: record.status,
          amountCents: record.amountCents,
          createdAt: record.createdAt.toISOString(),
        }
      : { orderId: id, provider: 'DISABLED', status: 'DISABLED', amountCents: 0 };
  }

  @Post(':id/pay')
  @Roles(AdminRole.OWNER)
  @HttpCode(200)
  @ApiOperation({ summary: '发起支付（V1 恒返回 PAYMENT_DISABLED）' })
  pay(@Param('id') id: string): Promise<never> {
    return this.payments.pay(id);
  }
}
