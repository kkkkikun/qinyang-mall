import { StorageService } from './storage.service';

/**
 * 受控本地文件存储（开发 / 测试环境）。
 * 对象键为 `products/<productCode>/<role>-<filename>`，目录穿越一律拒绝。
 */
export class LocalFileStorageService extends StorageService {
  private readonly root: string;
  private readonly publicBaseUrl: string;

  constructor(root: string, publicBaseUrl: string) {
    super();
    this.root = root.replace(/\/+$/, '');
    this.publicBaseUrl = publicBaseUrl.replace(/\/+$/, '');
  }

  async put(
    key: string,
    data: Buffer,
    contentType = 'application/octet-stream',
  ): Promise<{ key: string; url: string; bytes: number; contentType: string }> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    return {
      key,
      url: this.publicUrl(key),
      bytes: data.byteLength,
      contentType,
    };
  }

  async read(key: string): Promise<Buffer> {
    const fs = await import('node:fs/promises');
    return fs.readFile(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    const fs = await import('node:fs/promises');
    await fs.rm(this.resolve(key), { force: true });
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key.replace(/^\/+/, '')}`;
  }

  /** 解析并阻断路径穿越 */
  private resolve(key: string): string {
    const path = require('node:path') as typeof import('node:path');
    const normalized = path.posix.normalize(key.replace(/\\/g, '/')).replace(/^(\.\.(\/|$))+/, '');
    if (normalized.startsWith('..') || normalized.includes('\0')) {
      throw new Error('INVALID_STORAGE_KEY');
    }
    const target = path.resolve(this.root, normalized);
    const root = path.resolve(this.root);
    if (!target.startsWith(root + path.sep)) {
      throw new Error('INVALID_STORAGE_KEY');
    }
    return target;
  }
}
