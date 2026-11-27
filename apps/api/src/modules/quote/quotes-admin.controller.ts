import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@qinyang/contracts';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import type { AdminPrincipal } from '../../common/decorators/current-admin.decorator';
import { QuoteService } from './quotes.service';

/**
 * 管理端报价接口。
 *
 * 注意：本控制器此前被放在 customization-admin.controller.ts 里，且没有注册到任何
 * 模块的 controllers 数组 —— 路由从未生效，后台「撤回报价」按钮线上必定 404。
 * 此类「定义了但未注册」的死路由，自动化验证必须覆盖到，否则无法发现。
 */
@ApiTags('管理端 · 报价')
@ApiBearerAuth('admin')
@UseGuards(AdminAuthGuard, RolesGuard)
@Controller('admin/quotes')
export class QuotesAdminController {
  constructor(private readonly quotes: QuoteService) {}

  @Post(':id/withdraw')
  @Roles(AdminRole.OWNER)
  @HttpCode(200)
  @ApiOperation({ summary: '撤回当前有效报价（店主专属）' })
  withdraw(@Param('id') id: string, @CurrentAdmin() admin: AdminPrincipal) {
    return this.quotes.withdraw(id, admin);
  }
}
