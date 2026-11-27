import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from '../../database/entities/admin-user.entity';
import { Customer } from '../../database/entities/customer.entity';
import { TokenService } from '../../common/tokens/token.service';
import { RateLimiterService } from '../../common/rate-limit/rate-limiter.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminSessionService } from './admin-session.service';
import { AdminAuthService } from './admin-auth.service';
import { CustomerAuthController } from './customer-auth.controller';
import { CustomerAuthService } from './customer-auth.service';
import {
  CustomerIdentityProvider,
  MockIdentityProvider,
  WechatIdentityProvider,
} from './customer-identity.provider';

@Global()
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([AdminUser, Customer])],
  controllers: [AdminAuthController, CustomerAuthController],
  providers: [
    TokenService,
    AdminAuthService,
    AdminSessionService,
    CustomerAuthService,
    RateLimiterService,
    {
      provide: CustomerIdentityProvider,
      inject: [ConfigService],
      useFactory: (config: ConfigService): CustomerIdentityProvider =>
        config.get<boolean>('wechat.mockAuth') === true
          ? new MockIdentityProvider()
          : new WechatIdentityProvider(config),
    },
  ],
  exports: [
    TokenService,
    AdminAuthService,
    AdminSessionService,
    CustomerAuthService,
    RateLimiterService,
  ],
})
export class AuthModule {}
