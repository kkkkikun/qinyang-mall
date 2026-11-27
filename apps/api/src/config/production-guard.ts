/**
 * 生产环境启动闸门。
 *
 * 背景（本轮安全审计发现的 P0）：
 * JWT 密钥原本带「开发默认值」，且顾客端模拟登录 `WECHAT_MOCK_AUTH` 默认开启。
 * 这两项默认值一旦被带到生产环境，等同于没有认证：
 *   - 任何人都能用公开的默认密钥自行签出 `role: OWNER` 的管理员令牌，
 *     直接接管后台并读走全体顾客的联系方式与量体数据；
 *   - 任何人用任意 `code` 都能登录顾客端，并用同一 code 接管既有顾客。
 *
 * 因此：生产环境必须显式配置这些项，并在**启动时**强制校验，
 * 不满足就拒绝启动 —— 宁可起不来，也不要静默带着默认密钥上线。
 */
import type { AppConfig } from './configuration';

/** 开发默认值，出现即视为未配置 */
const DEV_SECRETS = ['dev-only-', 'change-me'];

function isWeakSecret(value: string | undefined): boolean {
  if (!value || value.trim().length < 32) {
    return true;
  }
  return DEV_SECRETS.some((marker) => value.includes(marker));
}

export function assertProductionConfig(config: AppConfig): string[] {
  if (config.nodeEnv !== 'production') {
    return [];
  }

  const problems: string[] = [];

  if (isWeakSecret(config.jwt.adminSecret)) {
    problems.push('JWT_ADMIN_SECRET 必须显式设置，且长度不少于 32 位、不得使用默认值');
  }
  if (isWeakSecret(config.jwt.customerSecret)) {
    problems.push('JWT_CUSTOMER_SECRET 必须显式设置，且长度不少于 32 位、不得使用默认值');
  }
  if (
    config.jwt.adminSecret &&
    config.jwt.customerSecret &&
    config.jwt.adminSecret === config.jwt.customerSecret
  ) {
    problems.push('JWT_ADMIN_SECRET 与 JWT_CUSTOMER_SECRET 不能相同');
  }
  if (config.wechat.mockAuth) {
    problems.push('生产环境必须关闭 WECHAT_MOCK_AUTH（模拟登录等于无认证）');
  }
  if (!config.wechat.appId || !config.wechat.appSecret) {
    problems.push('生产环境必须配置 WECHAT_APP_ID 与 WECHAT_APP_SECRET');
  }

  return problems;
}

/**
 * 启动时调用。返回问题清单（便于调用方决定是退出还是仅告警）。
 */
export function assertProductionConfigOrThrow(config: AppConfig): void {
  const problems = assertProductionConfig(config);
  if (problems.length > 0) {
    throw new Error(
      `生产环境配置校验未通过，已拒绝启动：\n  - ${problems.join('\n  - ')}\n` +
        '（本项目上线前请按 docs/RUNBOOK.md §1.3 配置这些环境变量）',
    );
  }
}
