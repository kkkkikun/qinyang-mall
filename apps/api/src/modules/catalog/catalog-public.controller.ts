import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ProductListQuery } from '@qinyang/contracts';
import { ProductsService } from './products.service';
import { CategoriesService } from './categories.service';
import { BannersService } from './banners.service';
import { GuidesService } from './guides.service';
import { ProductListQueryDto } from './dto/product.dto';

/** 顾客端只读接口：仅暴露已发布商品 */
@ApiTags('顾客端 · 商品')
@Controller()
export class CatalogPublicController {
  constructor(
    private readonly products: ProductsService,
    private readonly categories: CategoriesService,
    private readonly banners: BannersService,
    private readonly guides: GuidesService,
  ) {}

  @Get('categories')
  @ApiOperation({ summary: '分类树' })
  listCategories() {
    return this.categories.tree(true);
  }

  @Get('banners')
  @ApiOperation({ summary: '首页轮播' })
  listBanners() {
    return this.banners.listActive();
  }

  @Get('products')
  @ApiOperation({ summary: '商品列表（搜索 / 分类筛选）' })
  listProducts(@Query() query: ProductListQueryDto) {
    const payload: ProductListQuery = {
      keyword: query.keyword,
      categoryId: query.categoryId,
      group: query.group,
      page: query.page,
      pageSize: query.pageSize,
    };
    return this.products.listPublic(payload);
  }

  @Get('products/:id')
  @ApiOperation({ summary: '商品详情（含图集）' })
  getProduct(@Param('id') id: string) {
    return this.products.getPublic(id);
  }

  @Get('guides/:slug')
  @ApiOperation({ summary: '图文说明页：measure-top / measure-bottom / care / material' })
  getGuide(@Param('slug') slug: string) {
    return this.guides.get(slug);
  }
}
