import type { NestExpressApplication } from '@nestjs/platform-express';

export interface StaticAssetsOptions {
  /** 可写存储根：后台新上传的素材 */
  storageRoot: string;
  /** 只读媒体根：商品目录已生成的图片；留空表示不额外挂载 */
  mediaRoot?: string;
  /** 对外可访问基地址，用于推导静态前缀 */
  publicBaseUrl: string;
}

/**
 * 由对外基地址推导静态资源前缀。
 *
 * 例：`http://127.0.0.1:18110/static` → `/static`；
 * 未带路径时回退为 `/static`。
 */
export const resolveStaticPrefix = (publicBaseUrl: string): string => {
  const trimmed = (publicBaseUrl ?? '').trim();
  if (!trimmed) return '/static';
  const withoutScheme = trimmed.replace(/^https?:\/\/[^/]+/i, '');
  const path = withoutScheme.split('?')[0].replace(/\/+$/, '').trim();
  if (!path) return '/static';
  return path.startsWith('/') ? path : `/${path}`;
};

/**
 * 挂载静态资源。
 *
 * 两个根共用同一前缀：
 * 1. 可写存储根优先 —— 后台新上传的同名文件覆盖目录旧图；
 * 2. 只读媒体根兜底 —— 目录生成图（容器内 ro 挂载）由此对外提供。
 *
 * express 静态中间件默认 fallthrough，未命中时会交给下一个处理器，
 * 因此两个根可以安全地共用一个前缀。
 */
export const mountStaticAssets = (
  app: NestExpressApplication,
  options: StaticAssetsOptions,
): void => {
  const prefix = resolveStaticPrefix(options.publicBaseUrl);
  app.useStaticAssets(options.storageRoot, { prefix });
  const mediaRoot = (options.mediaRoot ?? '').trim();
  if (mediaRoot) {
    app.useStaticAssets(mediaRoot, { prefix });
  }
};
