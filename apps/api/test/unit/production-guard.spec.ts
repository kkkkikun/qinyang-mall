import { assertProductionConfig } from '../../src/config/production-guard';
import type { AppConfig } from '../../src/config/configuration';

function config(overrides: Partial<AppConfig> = {}): AppConfig {
  const base: AppConfig = {
    nodeEnv: 'development',
    port: 3000,
    apiPrefix: 'api/v1',
    jwt: {
      adminSecret: 'a'.repeat(40),
      customerSecret: 'b'.repeat(40),
      adminExpiresIn: '8h',
      customerExpiresIn: '720h',
    },
    wechat: { appId: 'wx-test', appSecret: 'secret', mockAuth: false },
    database: {
      host: '127.0.0.1',
      port: 3306,
      username: 'u',
      password: 'p',
      database: 'd',
      poolSize: 10,
    },
    storage: {
      driver: 'local',
      localRoot: '/tmp/storage',
      mediaRoot: '/tmp/media',
      publicBaseUrl: 'http://127.0.0.1:18110/static',
    },
    payment: { enabled: false },
    auth: {
      rateLimit: {
        enabled: false,
        windowMs: 60_000,
        adminMaxAttempts: 10,
        customerMaxAttempts: 30,
      },
    },
    corsOrigins: [],
  };
  return { ...base, ...overrides } as AppConfig;
}

describe('生产环境启动闸门', () => {
  it('开发环境不拦截（本地与测试要能直接跑）', () => {
    expect(assertProductionConfig(config())).toEqual([]);
  });

  it('生产环境：默认 JWT 密钥被拦下', () => {
    const problems = assertProductionConfig(
      config({
        nodeEnv: 'production',
        jwt: {
          adminSecret: 'dev-only-admin-secret-change-me',
          customerSecret: 'dev-only-customer-secret-change-me',
          adminExpiresIn: '8h',
          customerExpiresIn: '720h',
        },
      }),
    );
    expect(problems.join('\n')).toContain('JWT_ADMIN_SECRET');
    expect(problems.join('\n')).toContain('JWT_CUSTOMER_SECRET');
  });

  it('生产环境：过短的密钥被拦下', () => {
    const problems = assertProductionConfig(
      config({
        nodeEnv: 'production',
        jwt: {
          adminSecret: 'short',
          customerSecret: 'also-short',
          adminExpiresIn: '8h',
          customerExpiresIn: '720h',
        },
      }),
    );
    expect(problems.length).toBeGreaterThanOrEqual(2);
  });

  it('生产环境：两个密钥相同被拦下', () => {
    const problems = assertProductionConfig(
      config({
        nodeEnv: 'production',
        jwt: {
          adminSecret: 'x'.repeat(40),
          customerSecret: 'x'.repeat(40),
          adminExpiresIn: '8h',
          customerExpiresIn: '720h',
        },
      }),
    );
    expect(problems.join('\n')).toContain('不能相同');
  });

  it('生产环境：开启模拟登录被拦下（等于没有认证）', () => {
    const problems = assertProductionConfig(
      config({ nodeEnv: 'production', wechat: { appId: 'wx', appSecret: 's', mockAuth: true } }),
    );
    expect(problems.join('\n')).toContain('WECHAT_MOCK_AUTH');
  });

  it('生产环境：缺少 AppID / Secret 被拦下', () => {
    const problems = assertProductionConfig(
      config({ nodeEnv: 'production', wechat: { appId: '', appSecret: '', mockAuth: false } }),
    );
    expect(problems.join('\n')).toContain('WECHAT_APP_ID');
  });

  it('生产环境：配置齐备时放行', () => {
    expect(assertProductionConfig(config({ nodeEnv: 'production' }))).toEqual([]);
  });
});
