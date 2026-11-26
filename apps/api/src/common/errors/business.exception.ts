import { ERROR_CODES } from '@qinyang/contracts';
import { HttpException, HttpStatus } from '@nestjs/common';

export interface BusinessErrorOptions {
  /** 业务错误码，取自 contracts 的 ERROR_CODES */
  code: string;
  message: string;
  status?: HttpStatus;
  details?: unknown;
}

/**
 * 业务异常。HTTP 状态码保持语义，业务错误码通过响应体的 code 字段透出。
 */
export class BusinessException extends HttpException {
  readonly businessCode: string;

  constructor(options: BusinessErrorOptions) {
    super(
      {
        code: options.code,
        message: options.message,
        details: options.details ?? null,
      },
      options.status ?? HttpStatus.BAD_REQUEST,
    );
    this.businessCode = options.code;
  }

  static notFound(message: string, code: string = ERROR_CODES.NOT_FOUND): BusinessException {
    return new BusinessException({ code, message, status: HttpStatus.NOT_FOUND });
  }

  static forbidden(message: string): BusinessException {
    return new BusinessException({
      code: ERROR_CODES.FORBIDDEN,
      message,
      status: HttpStatus.FORBIDDEN,
    });
  }

  static unauthorized(message = '未登录或登录已过期'): BusinessException {
    return new BusinessException({
      code: ERROR_CODES.UNAUTHORIZED,
      message,
      status: HttpStatus.UNAUTHORIZED,
    });
  }

  static conflict(message: string, code: string): BusinessException {
    return new BusinessException({ code, message, status: HttpStatus.CONFLICT });
  }

  static badRequest(message: string, code: string = ERROR_CODES.VALIDATION_FAILED): BusinessException {
    return new BusinessException({ code, message, status: HttpStatus.BAD_REQUEST });
  }
}
