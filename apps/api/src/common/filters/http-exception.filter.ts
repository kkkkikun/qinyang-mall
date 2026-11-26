import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ERROR_CODES } from '@qinyang/contracts';

/**
 * 统一异常响应。
 *
 * 隐私约束：本过滤器**只记录方法、路径、状态码与业务码**，
 * 绝不记录请求体，避免量体资料、联系方式、收货地址进入普通日志。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message, details } = this.normalize(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.route?.path ?? request.path} -> ${status} ${code}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.route?.path ?? request.path} -> ${status} ${code}: ${message}`,
      );
    }

    response.status(status).json({
      code,
      message,
      data: null,
      details: details ?? null,
      requestId: (request as Request & { requestId?: string }).requestId,
    });
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'object' && payload !== null) {
        const record = payload as Record<string, unknown>;
        const rawMessage = record.message;
        const message = Array.isArray(rawMessage)
          ? rawMessage.join('；')
          : typeof rawMessage === 'string'
            ? rawMessage
            : exception.message;
        const code = typeof record.code === 'string' ? record.code : this.defaultCode(status);
        return {
          status,
          code,
          message,
          details: record.details ?? undefined,
        };
      }

      return {
        status,
        code: this.defaultCode(status),
        message: typeof payload === 'string' ? payload : exception.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.VALIDATION_FAILED,
      message: '服务器内部错误',
    };
  }

  private defaultCode(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ERROR_CODES.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ERROR_CODES.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ERROR_CODES.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ERROR_CODES.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ERROR_CODES.INVALID_STATUS_TRANSITION;
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
