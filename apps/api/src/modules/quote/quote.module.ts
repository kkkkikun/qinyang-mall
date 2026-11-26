import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomizationRequest } from '../../database/entities/customization-request.entity';
import { Order } from '../../database/entities/order.entity';
import { Quote } from '../../database/entities/quote.entity';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { QuoteService } from './quotes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quote, CustomizationRequest, Order]),
    AuditModule,
    CatalogModule,
  ],
  providers: [QuoteService],
  exports: [QuoteService],
})
export class QuoteModule {}
