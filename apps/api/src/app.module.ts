import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { entities } from './database/entities';
import { migrations } from './database/migrations';
import { configuration } from './config/configuration';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { QuoteModule } from './modules/quote/quote.module';
import { CustomizationModule } from './modules/customization/customization.module';
import { OrderModule } from './modules/order/order.module';
import { PaymentModule } from './modules/payment/payment.module';
import { StorageModule } from './modules/storage/storage.module';
import { HealthController } from './modules/health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql' as const,
        host: config.get<string>('database.host'),
        port: Number(config.get<number>('database.port')),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.database'),
        charset: 'utf8mb4',
        timezone: config.get<string>('database.timezone') ?? '+08:00',
        entities,
        migrations,
        // 红线：正式配置禁止自动同步 schema，结构只由 migration 演进
        synchronize: false,
        migrationsRun: false,
        logging: config.get<string>('nodeEnv') === 'development' ? ['error', 'warn'] : ['error'],
        // 连接池大小走配置（此前运行时写死 10，DB_POOL_SIZE 只对 CLI 生效）
        extra: { connectionLimit: Number(config.get<number>('database.poolSize') ?? 10) },
      }),
    }),
    StorageModule,
    AuthModule,
    AuditModule,
    CatalogModule,
    TemplatesModule,
    QuoteModule,
    CustomizationModule,
    OrderModule,
    PaymentModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
