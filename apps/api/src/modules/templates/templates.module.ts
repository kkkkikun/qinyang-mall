import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeasurementTemplate } from '../../database/entities/measurement-template.entity';
import { Category } from '../../database/entities/category.entity';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { TemplatesService } from './templates.service';
import { TemplatesAdminController } from './templates-admin.controller';
import { TemplatesPublicController } from './templates-public.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MeasurementTemplate, Category]), AuditModule, CatalogModule],
  controllers: [TemplatesAdminController, TemplatesPublicController],
  providers: [TemplatesService],
  exports: [TemplatesService],
})
export class TemplatesModule {}
