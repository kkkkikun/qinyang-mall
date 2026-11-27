import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole, ProductListQuery } from '@qinyang/contracts';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';
import { ProductsService } from './products.service';
import { ProductImportService } from './product-import.service';
import {
  ProductBatchStatusDto,
  ProductImportDto,
  ProductListQueryDto,
  ProductMediaUpdateDto,
  ProductMediaUpsertDto,
  ProductStatusDto,
  ProductUpsertDto,
} from './dto/product.dto';

@ApiTags('管理端 · 商品')
@ApiBearerAuth('admin')
@UseGuards(AdminAuthGuard, RolesGuard)
@Controller('admin/products')
export class ProductsAdminController {
  constructor(
    private readonly products: ProductsService,
    private readonly importService: ProductImportService,
  ) {}

  @Get()
  @ApiOperation({ summary: '商品列表（含未发布）' })
  list(@Query() query: ProductListQueryDto) {
    const payload: ProductListQuery = {
      keyword: query.keyword,
      categoryId: query.categoryId,
      group: query.group,
      status: query.status,
      pricingMode: query.pricingMode,
      page: query.page,
      pageSize: query.pageSize,
    };
    return this.products.listAdmin(payload);
  }

  @Get(':id')
  @ApiOperation({ summary: '商品详情' })
  get(@Param('id') id: string) {
    return this.products.getAdmin(id);
  }

  @Post()
  @ApiOperation({ summary: '新增商品' })
  create(@Body() dto: ProductUpsertDto, @CurrentAdmin() admin: AdminPrincipal) {
    return this.products.create(dto, admin);
  }

  /**
   * 批量上下架（店主专属）。
   *
   * 声明在 `@Put(':id')` 之前，避免 "batch-status" 被当成商品 id。
   */
  @Post('batch-status')
  @HttpCode(200)
  @Roles(AdminRole.OWNER)
  @ApiOperation({ summary: '批量上下架（店主专属）' })
  batchChangeStatus(
    @Body() dto: ProductBatchStatusDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.products.batchChangeStatus(dto.ids, dto.status, admin);
  }

  /**
   * 商品 CSV 批量导入。
   *
   * 只新增不覆盖：编号已存在的行会被跳过；导入的商品一律草稿，
   * 上架仍走店主审核流程。支持 `dryRun` 预检（只校验不落库）。
   */
  @Post('import')
  @HttpCode(200)
  @ApiOperation({ summary: '商品 CSV 批量导入（只新增，不覆盖；导入商品为草稿）' })
  importProducts(
    @Body() dto: ProductImportDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.importService.importFromCsv(dto, admin);
  }

  @Put(':id')
  @ApiOperation({ summary: '修改商品' })
  update(
    @Param('id') id: string,
    @Body() dto: ProductUpsertDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.products.update(id, dto, admin);
  }

  @Post(':id/status')
  @HttpCode(200)
  @Roles(AdminRole.OWNER)
  @ApiOperation({ summary: '上下架 / 提交审核（店主专属）' })
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ProductStatusDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.products.changeStatus(id, dto.status, admin);
  }

  @Post(':id/media')
  @ApiOperation({ summary: '追加图集' })
  addMedia(
    @Param('id') id: string,
    @Body() dto: ProductMediaUpsertDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.products.addMedia(id, dto, admin);
  }

  @Put(':id/media/:mediaId')
  @ApiOperation({ summary: '调整图集条目（排序 / 角色）' })
  updateMedia(
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Body() dto: ProductMediaUpdateDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.products.updateMedia(id, mediaId, dto, admin);
  }

  @Delete(':id/media/:mediaId')
  @ApiOperation({ summary: '移除图集条目' })
  removeMedia(
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.products.removeMedia(id, mediaId, admin);
  }

  @Delete(':id')
  @Roles(AdminRole.OWNER)
  @ApiOperation({ summary: '删除商品（未发布且未被定制申请引用时，店主专属）' })
  remove(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal) {
    return this.products.remove(id, admin);
  }
}
