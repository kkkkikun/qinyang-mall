import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { BusinessException } from '../errors/business.exception';
import { TokenService } from '../tokens/token.service';
import type { CustomerPrincipal } from '../decorators/customer.decorator';

export interface CustomerRequest extends Request {
  customer?: CustomerPrincipal;
}

/** 顾客登录校验：令牌来自 Authorization: Bearer 或 x-customer-token */
@Injectable()
export class CustomerAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const token =
      extractCustomerToken(request.headers['x-customer-token']) ??
      extractCustomerToken(request.headers.authorization);
    if (!token) throw BusinessException.unauthorized();

    try {
      const payload = await this.tokens.verifyCustomer(token);
      request.customer = { id: payload.sub, nickname: payload.nickname };
      return true;
    } catch {
      throw BusinessException.unauthorized('登录状态无效或已过期');
    }
  }
}

function extractCustomerToken(raw: string | string[] | undefined): string | null {
  if (!raw) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const trimmed = value.startsWith('Bearer ') ? value.slice(7).trim() : value.trim();
  return trimmed || null;
}
