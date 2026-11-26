import { Injectable } from '@nestjs/common';

export interface StoredObject {
  key: string;
  url: string;
  bytes: number;
  contentType: string;
}

/**
 * 图片存储抽象接口。
 * V1 使用受控文件存储；正式环境接商家授权的对象存储时只需新增一个实现，
 * 业务层不感知差异。
 */
@Injectable()
export abstract class StorageService {
  abstract put(
    key: string,
    data: Buffer,
    contentType?: string,
  ): Promise<StoredObject>;

  abstract read(key: string): Promise<Buffer>;

  abstract remove(key: string): Promise<void>;

  abstract publicUrl(key: string): string;
}
