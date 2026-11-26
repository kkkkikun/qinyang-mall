import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BusinessException } from '../../common/errors/business.exception';
import { TemplatesService } from './templates.service';
import { ProductsService } from '../catalog/products.service';

@ApiTags('顾客端 · 量体模板')
@Controller('measurement-templates')
export class TemplatesPublicController {
  constructor(
    private readonly templates: TemplatesService,
    private readonly products: ProductsService,
  ) {}

  @Get('resolve')
  @ApiOperation({ summary: '按商品解析当前可用量体模板' })
  async resolve(@Query('productId') productId: string) {
    if (!productId) {
      throw BusinessException.badRequest('缺少 productId');
    }
    const product = await this.products.getPublic(productId);
    const template = await this.templates.resolveForCategory(product.categoryId);
    return {
      productId: product.id,
      templateId: template?.id ?? null,
      templateCode: template?.code ?? null,
      templateName: template?.name ?? null,
      templateVersion: template?.version ?? null,
      // 与 MeasurementTemplateDto 同名的字段，便于前端直接当模板对象使用
      code: template?.code ?? null,
      name: template?.name ?? null,
      version: template?.version ?? null,
      status: template?.status ?? null,
      applicableCategories: template?.applicableCategories ?? [],
      summary: template?.summary ?? null,
      measurementSections: template?.measurementSections ?? [],
    };
  }
}
