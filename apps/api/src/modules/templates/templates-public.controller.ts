import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductStatus } from '@qinyang/contracts';
import { BusinessException } from '../../common/errors/business.exception';
import { TemplatesService } from './templates.service';
import { toMeasurementSections } from './measurement-shape';
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
    const product = await this.products.findOne(productId);
    if (!product) {
      throw BusinessException.notFound('商品不存在');
    }
    if (product.status !== ProductStatus.PUBLISHED) {
      throw BusinessException.notFound('商品已下架');
    }
    // 与提交校验同源：优先用商品绑定的模板，避免「表单字段与校验模板不一致」
    const template = await this.templates.resolveForProduct(product);
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
      // 读路径归一化：历史行可能是原型 snake_case 形状，
      // 不归一化的话顾客端拿到的是 undefined 字段，量体表单会渲染为空。
      measurementSections: toMeasurementSections(template?.measurementSections),
    };
  }
}
