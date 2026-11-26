import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomizationRequest } from '../../database/entities/customization-request.entity';
import { Product } from '../../database/entities/product.entity';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { TemplatesModule } from '../templates/templates.module';
import { QuoteModule } from '../quote/quote.module';
import { CustomizationService } from './customization.service';
import { CustomizationCustomerController } from './customization-customer.controller';
import { CustomizationAdminController } from './customization-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomizationRequest, Product]),
    AuditModule,
    CatalogModule,
    TemplatesModule,
    QuoteModule,
  ],
  controllers: [CustomizationCustomerController, CustomizationAdminController],
  providers: [CustomizationService],
  exports: [CustomizationService],
})
export class CustomizationModule {}
