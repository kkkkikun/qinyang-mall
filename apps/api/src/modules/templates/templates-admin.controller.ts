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
import { AdminRole } from '@qinyang/contracts';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';
import { TemplatesService } from './templates.service';
import { TemplateUpsertDto } from './dto/template.dto';

@ApiTags('管理端 · 量体模板')
@ApiBearerAuth('admin')
@UseGuards(AdminAuthGuard, RolesGuard)
@Controller('admin/measurement-templates')
export class TemplatesAdminController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: '模板列表（含历史版本）' })
  list() {
    return this.templates.list();
  }

  @Get(':id')
  @ApiOperation({ summary: '模板详情' })
  get(@Param('id') id: string) {
    return this.templates.get(id);
  }

  @Post()
  @Roles(AdminRole.OWNER)
  @ApiOperation({ summary: '新建模板（店主专属）' })
  create(@Body() dto: TemplateUpsertDto, @CurrentAdmin() admin: AdminPrincipal) {
    return this.templates.create(dto, admin);
  }

  @Put(':id')
  @Roles(AdminRole.OWNER)
  @ApiOperation({ summary: '修改草稿模板（店主专属）' })
  update(
    @Param('id') id: string,
    @Body() dto: TemplateUpsertDto,
    @CurrentAdmin() admin: AdminPrincipal,
  ) {
    return this.templates.update(id, dto, admin);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Roles(AdminRole.OWNER)
  @ApiOperation({ summary: '发布模板；已发布模板再次发布则生成新版本' })
  publish(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal) {
    return this.templates.publish(id, admin);
  }

  @Delete(':id')
  @Roles(AdminRole.OWNER)
  @ApiOperation({ summary: '删除模板（未被商品引用时，店主专属）' })
  remove(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal) {
    return this.templates.remove(id, admin);
  }
}
