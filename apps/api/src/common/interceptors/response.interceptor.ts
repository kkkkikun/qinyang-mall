import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface RequestWithMeta extends Request {
  requestId?: string;
}

/**
 * 统一响应包装：{ code, message, data, requestId }
 * 仅包装成功响应；异常由 HttpExceptionFilter 统一格式化。
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithMeta>();
    const response = http.getResponse<Response>();

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
