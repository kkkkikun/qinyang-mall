import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminUser, LoginResponse } from '@qinyang/contracts';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminAuthService } from './admin-auth.service';
import { AdminLoginDto } from './dto/auth.dto';

@ApiTags('管理端认证')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '店主 / 店员登录' })
  login(@Body() dto: AdminLoginDto): Promise<LoginResponse> {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth('admin')
  @ApiOperation({ summary: '当前管理员' })
  me(@CurrentAdmin('id') adminId: string): Promise<AdminUser | null> {
    return this.auth.findById(adminId);
  }
}
