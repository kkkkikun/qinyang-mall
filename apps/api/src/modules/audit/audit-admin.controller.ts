import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole, AuditLogListQuery } from '@qinyang/contracts';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditService } from './audit.service';

@ApiTags('管理端 · 审计日志')
@ApiBearerAuth('admin')
@UseGuards(AdminAuthGuard, RolesGuard)
@Roles(AdminRole.OWNER)
@Controller('admin/audit-logs')
export class AuditAdminController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: '审计日志（店主专属）' })
  list(@Query() query: AuditLogListQuery) {
    return this.audit.list(query);
  }
}
