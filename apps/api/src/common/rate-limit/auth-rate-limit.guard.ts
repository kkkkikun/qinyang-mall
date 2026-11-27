import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { ERROR_CODES } from '@qinyang/contracts';
import { BusinessException } from '../errors/business.exception';
import { RateLimiterService } from './rate-limiter.service';

/**
 * 限流维度：**端 + 客户端 IP + 账号**。
 *
 * 只按 IP 会误伤同一出口的正常用户（商场 WiFi、公司网）；
 * 只按账号挡不住「一账号多 IP」的分布式尝试。两个一起看才有意义。
 *
 * 守卫与控制器共用这个函数 —— 登录成功时才能清掉同一个桶。
 */
export function authRateLimitKey(kind: 'admin' | 'customer', request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = raw
    ? String(raw).split(',')[0].trim()
    : request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  const body = (request.body ?? {}) as Record<string, unknown>;
  const account = typeof body.username === 'string'
    ? body.username
    : typeof body.code === 'string'
      ? body.code
      : '-';
  return `${kind}:${ip}:${account}`;
}

/**
 * 登录接口限流守卫。
 *
 * 现状问题：顾客与管理员的登录接口此前**没有任何频率限制**，
 * 撞库与暴力破解没有阻挡（每次尝试都要走一次 bcrypt，攻击成本低但服务端被打）。
 *
 * 本守卫的取舍：
 * - **默认关闭**（`AUTH_RATE_LIMIT_ENABLED` 未开启时不做任何限制）。
 *   限流放在应用层还是网关层，需要商家拍板（D-17）：
 *   应用层的优点是不依赖基础设施、错误提示更贴近业务；
 *   网关层的优点是多实例共享、对非 HTTP 入口也有效。
 *   先把能力做好并默认关闭，商家定了口径后改一个环境变量即可。
 * - **维度 = 端 + 客户端 IP + 账号**（见 `authRateLimitKey`）。
 * - **固定窗口计数**，登录成功即清零（正常用户输错一两次不该被牵连）。
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly limiter: RateLimiterService,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const enabled = this.config.get<boolean>('auth.rateLimit.enabled') === true;
    if (!enabled) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const kind = request.path.includes('/customer') ? 'customer' : 'admin';
    const limit =
      kind === 'customer'
        ? Number(this.config.get<number>('auth.rateLimit.customerMaxAttempts') ?? 30)
        : Number(this.config.get<number>('auth.rateLimit.adminMaxAttempts') ?? 10);
    const windowMs = Number(this.config.get<number>('auth.rateLimit.windowMs') ?? 60_000);

    const key = authRateLimitKey(kind, request);
    const result = this.limiter.allow(key, limit, windowMs);
    if (!result.allowed) {
      throw new BusinessException({
        code: ERROR_CODES.RATE_LIMITED,
        message: `尝试过于频繁，请 ${result.retryAfterSeconds} 秒后再试`,
        status: 429,
      });
    }
    return true;
  }
}
