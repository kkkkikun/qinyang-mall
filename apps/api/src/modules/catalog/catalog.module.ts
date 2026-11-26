import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Banner } from '../../database/entities/banner.entity';
import { Category } from '../../database/entities/category.entity';
import { GuidePage } from '../../database/entities/guide-page.entity';
import { MeasurementTemplate } from '../../database/entities/measurement-template.entity';
import { Product } from '../../database/entities/product.entity';
import { ProductMedia } from '../../database/entities/product-media.entity';
import { AuditModule } from '../audit/audit.module';
import { ProductsService } from './products.service';
import { CategoriesService } from './categories.service';
import { BannersService } from './banners.service';
import { GuidesService } from './guides.service';
import { CatalogPublicController } from './catalog-public.controller';
import { ProductsAdminController } from './products-admin.controller';
import { CategoriesAdminController } from './categories-admin.controller';
import { BannersAdminController } from './banners-admin.controller';
import { MediaAdminController } from './media-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      ProductMedia,
      Category,
      Banner,
      GuidePage,
      MeasurementTemplate,
    ]),
    AuditModule,
  ],
  controllers: [
    CatalogPublicController,
    ProductsAdminController,
    CategoriesAdminController,
    BannersAdminController,
    MediaAdminController,
  ],
  providers: [ProductsService, CategoriesService, BannersService, GuidesService],
  exports: [ProductsService, CategoriesService, BannersService, GuidesService],
})
export class CatalogModule {}
