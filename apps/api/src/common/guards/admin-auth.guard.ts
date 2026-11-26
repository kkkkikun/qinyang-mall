import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { BusinessException } from '../errors/business.exception';
import { TokenService } from '../tokens/token.service';
import type { AdminPrincipal } from '../decorators/current-admin.decorator';

export interface AdminRequest extends Request {
  admin?: AdminPrincipal;
}

/** 提取 Authorization: Bearer 或 x-admin-token */
export function extractToken(request: Request, headerName = 'authorization'): string | null {
  const direct = request.headers[headerName];
  const raw = Array.isArray(direct) ? direct[0] : direct;
  if (raw) {
    const value = raw.startsWith('Bearer ') ? raw.slice(7).trim() : raw.trim();
    if (value) return value;
  }
  const fallback = request.headers['x-admin-token'];
  const fallbackRaw = Array.isArray(fallback) ? fallback[0] : fallback;
  return fallbackRaw ? fallbackRaw.trim() : null;
}

/** 管理员登录校验 */
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = extractToken(request);
    if (!token) throw BusinessException.unauthorized();

    try {
      const payload = await this.tokens.verifyAdmin(token);
      request.admin = {
        id: payload.sub,
        username: payload.username,
        displayName: payload.displayName,
        role: payload.role,
      };
      return true;
    } catch {
      throw BusinessException.unauthorized('登录状态无效或已过期');
    }
  }
}
