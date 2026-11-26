import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('健康检查')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: '存活与依赖检查' })
  health() {
    return {
      status: 'ok',
      service: 'qinyang-api',
      time: new Date().toISOString(),
    };
  }
}
