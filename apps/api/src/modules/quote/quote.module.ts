import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomizationRequest } from '../../database/entities/customization-request.entity';
import { Order } from '../../database/entities/order.entity';
import { Quote } from '../../database/entities/quote.entity';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { QuoteService } from './quotes.service';
import { QuotesAdminController } from './quotes-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quote, CustomizationRequest, Order]),
    AuditModule,
    CatalogModule,
  ],
  controllers: [QuotesAdminController],
  providers: [QuoteService],
  exports: [QuoteService],
})
export class QuoteModule {}
