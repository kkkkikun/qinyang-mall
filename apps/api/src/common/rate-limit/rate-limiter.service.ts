import { Injectable } from '@nestjs/common';

/**
 * 进程内固定窗口限流器。
 *
 * 用途：登录接口的暴力尝试（撞库 / 暴力破解）。
 *
 * 为什么是「进程内」：
 * 后台与 API 目前都是**单实例**部署，进程内计数完全够用，
 * 且不引入任何新依赖（Redis 是另一个方案，见 D-17）。
 * 若将来要多实例部署，这个类需要换成共享存储（Redis / 网关层）——
 * 接口（`allow` / `reset`）刻意做成与存储无关，便于替换。
 *
 * 为什么是「固定窗口」而不是滑动窗口：
 * 固定窗口的边界允许最多 2 倍突发，但实现简单、无内存压力；
 * 登录限流要挡的是持续撞库，不是精确的速率整形。
 */
@Injectable()
export class RateLimiterService {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private operations = 0;

  /**
   * 消耗一次配额。
   *
   * @param key 限流维度（通常是「端 + IP + 账号」）
   * @param limit 窗口内允许的次数
   * @param windowMs 窗口长度（毫秒）
   * @returns 是否放行，以及还需等待多少秒
   */
  allow(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    this.sweep(now);

    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (bucket.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }

    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  /** 登录成功后清空该维度的计数（正常用户输错一两次不该被牵连） */
  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** 定期清掉过期桶，避免长期运行内存无限增长 */
  private sweep(now: number): void {
    this.operations += 1;
    if (this.operations % 256 !== 0) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
