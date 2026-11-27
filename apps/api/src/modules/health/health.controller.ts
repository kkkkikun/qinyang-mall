import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';

@ApiTags('健康检查')
@Controller('health')
export class HealthController {
  constructor(
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: '存活与依赖检查' })
  async health() {
    /**
     * 数据库探活。
     *
     * 此前这个端点恒返回 ok，数据库挂了容器仍显示 healthy，
     * 依赖它的 admin-web 也会照常拉起 —— 故障因此被"健康"掩盖。
     * 现在数据库不通就返回 503，让编排层与监控看到真实状态。
     */
    let database = 'ok';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      database = 'unavailable';
    }
    if (database !== 'ok') {
      throw new ServiceUnavailableException({
        status: 'degraded',
        service: 'qinyang-api',
        database,
        time: new Date().toISOString(),
      });
    }
    return {
      status: 'ok',
      service: 'qinyang-api',
      time: new Date().toISOString(),
      database,
      /**
       * 审计写入失败次数。
       * 审计失败不阻断主业务（避免审计表异常导致整站不可用），
       * 但「关键操作留痕」是契约要求，失败必须是可观测的。
       */
      auditWriteFailures: this.audit.failureCount,
    };
  }
}
