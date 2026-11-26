import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../../database/entities/order.entity';
import { PaymentRecord } from '../../database/entities/payment-record.entity';
import { DisabledPaymentGateway, PaymentGateway } from './payment.gateway';
import { PaymentService } from './payment.service';
import { PaymentAdminController } from './payment-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentRecord, Order])],
  controllers: [PaymentAdminController],
  providers: [
    PaymentService,
    // V1 只装配明确禁用的适配器；真实微信支付需商家批准后另行实现
    { provide: PaymentGateway, useClass: DisabledPaymentGateway },
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
