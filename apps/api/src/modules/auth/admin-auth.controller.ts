import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminUser, LoginResponse } from '@qinyang/contracts';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { AuthRateLimitGuard, authRateLimitKey } from '../../common/rate-limit/auth-rate-limit.guard';
import { RateLimiterService } from '../../common/rate-limit/rate-limiter.service';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/auth.dto';

@ApiTags('管理端认证')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly limiter: RateLimiterService,
  ) {}

  @Post('login')
  @HttpCode(200)
  // 登录限流（默认关闭，见 D-17：限流放应用层还是网关层）
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: '店主 / 店员登录' })
  async login(@Body() dto: AdminLoginDto, @Req() request: Request): Promise<LoginResponse> {
    const result = await this.auth.login(dto);
    // 登录成功即清零：正常用户输错一两次不该被牵连
    this.limiter.reset(authRateLimitKey('admin', request));
    return result;
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin')
  @ApiOperation({ summary: '当前管理员' })
  me(@CurrentAdmin('id') adminId: string): Promise<AdminUser | null> {
    return this.auth.findById(adminId);
  }
}
