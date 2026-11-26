import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CustomerProfile } from '@qinyang/contracts';
import { CustomerAuthGuard } from '../../common/guards/customer-auth.guard';
import { CurrentCustomer } from '../../common/decorators/customer.decorator';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerLoginDto } from './dto/auth.dto';

@ApiTags('顾客认证')
@Controller('auth')
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: '顾客登录（微信 code 换取令牌）' })
  login(@Body() dto: CustomerLoginDto) {
    return this.auth.login(dto.code);
  }

  @Get('me')
  @UseGuards(CustomerAuthGuard)
  @ApiBearerAuth('customer')
  @ApiOperation({ summary: '当前顾客资料' })
  me(@CurrentCustomer('id') customerId: string): Promise<CustomerProfile | null> {
    return this.auth.profile(customerId);
  }
}
