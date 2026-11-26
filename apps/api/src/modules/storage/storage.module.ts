import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LocalFileStorageService } from './local-file-storage.service';
import { StorageService } from './storage.service';

/**
 * 存储模块。driver = local 时使用受控文件存储；
 * driver = oss（对象存储）需商家授权后另行实现，缺失时明确报错而不是静默降级。
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService): StorageService => {
        const driver = config.get<string>('storage.driver') ?? 'local';
        if (driver === 'local') {
          return new LocalFileStorageService(
            config.get<string>('storage.localRoot') as string,
            config.get<string>('storage.publicBaseUrl') as string,
          );
        }
        throw new Error(
          `STORAGE_DRIVER=${driver} 尚未实现：对象存储需商家授权后接入受控实现`,
        );
      },
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
