import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RAW_RESPONSE_KEY } from '../decorators/raw-response.decorator';

export interface RequestWithMeta extends Request {
  requestId?: string;
}

/**
 * 统一响应包装：{ code, message, data, requestId }
 * 仅包装成功响应；异常由 HttpExceptionFilter 统一格式化。
 *
 * 标注了 `@RawResponse()` 的接口原样返回（CSV 导出需要真正的 text/csv）。
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  /**
   * Reflector 无状态，默认 new 一个即可，
   * 免得 main.ts 与各测试文件都要为了它改构造方式。
   */
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithMeta>();
    const response = http.getResponse<Response>();

    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({
        code: 0,
        message: 'ok',
        data: data ?? null,
        requestId: request.requestId ?? response.getHeader('x-request-id') ?? undefined,
      })),
    );
  }
}
