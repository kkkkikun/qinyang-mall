import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomizationRequest } from '../../database/entities/customization-request.entity';
import { Order } from '../../database/entities/order.entity';
import { OrderEvent } from '../../database/entities/order-event.entity';
import { Quote } from '../../database/entities/quote.entity';
import { AuditModule } from '../audit/audit.module';
import { OrdersService } from './orders.service';
import { OrdersAdminController } from './orders-admin.controller';
import { OrdersCustomerController } from './orders-customer.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderEvent, Quote, CustomizationRequest]),
    AuditModule,
  ],
  controllers: [OrdersAdminController, OrdersCustomerController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrderModule {}
