import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * 请求体体积上限。
 *
 * 背景（本轮输入校验审计）：
 * express-body-parser 的默认上限是 **100KB**，而「商品 CSV 批量导入」
 * 允许提交 2,000,000 字符的 CSV —— 两者不一致时，
 * 500 行含长文案的商品表会直接收到 **413**，DTO 上的 MaxLength 永远不可达。
 *
 * 这里统一成 4MB（比 DTO 上限留出余量），主进程与集成测试**共用同一份配置**，
 * 避免「测试通过、线上 413」这种只在生产暴露的问题。
 */
export const JSON_BODY_LIMIT = '4mb';
export const URLENCODED_BODY_LIMIT = '1mb';

/**
 * 注册请求体解析器。
 *
 * 必须在 `app.init()` **之前**调用：
 * Nest 在 init() 里注册默认解析器，而 body-parser 遇到已解析的请求体会跳过，
 * 因此先注册的这一份才会真正生效。
 */
export function configureBodyParsers(app: INestApplication): void {
  const express = app as Partial<NestExpressApplication>;
  if (typeof express.useBodyParser !== 'function') {
    throw new Error('当前 HTTP 适配器不支持 useBodyParser，无法统一请求体上限');
  }
  express.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  express.useBodyParser('urlencoded', { extended: true, limit: URLENCODED_BODY_LIMIT });
}
