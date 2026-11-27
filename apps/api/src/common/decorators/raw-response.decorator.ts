import { SetMetadata } from '@nestjs/common';

export const RAW_RESPONSE_KEY = 'qy:raw-response';

/**
 * 标记该接口返回**原样响应**，不套统一包装 { code, message, data }。
 *
 * 目前只有 CSV 导出用到：导出结果必须是 text/csv，
 * 若被包成 JSON，浏览器拿到的就不是 CSV 文件了。
 */
export const RawResponse = (): MethodDecorator & ClassDecorator =>
  SetMetadata(RAW_RESPONSE_KEY, true);
