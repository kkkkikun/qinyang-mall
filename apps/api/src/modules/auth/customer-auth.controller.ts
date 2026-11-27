import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerProfile } from '@qinyang/contracts';
import { CustomerAuthGuard } from '../../common/guards/customer-auth.guard';
import { AuthRateLimitGuard, authRateLimitKey } from '../../common/rate-limit/auth-rate-limit.guard';
import { RateLimiterService } from '../../common/rate-limit/rate-limiter.service';
import { CurrentCustomer } from '../../common/decorators/customer.decorator';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerLoginDto } from './dto/auth.dto';

@ApiTags('顾客认证')
@Controller('auth')
export class CustomerAuthController {
  constructor(
    private readonly auth: CustomerAuthService,
    private readonly limiter: RateLimiterService,
  ) {}

  @Post('login')
  @HttpCode(200)
  // 登录限流（默认关闭，见 D-17：限流放应用层还是网关层）
  @UseGuards(AuthRateLimitGuard)
  @ApiOperation({ summary: '顾客登录（微信 code 换取令牌）' })
  async login(@Body() dto: CustomerLoginDto, @Req() request: Request) {
    const result = await this.auth.login(dto.code);
    // 登录成功即清零：正常用户输错一两次不该被牵连
    this.limiter.reset(authRateLimitKey('customer', request));
    return result;
  }

  @Get('me')
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth('customer')
  @ApiOperation({ summary: '当前顾客资料' })
  me(@CurrentCustomer('id') customerId: string): Promise<CustomerProfile | null> {
    return this.auth.profile(customerId);
  }
}
