/**
 * 运行配置。所有敏感项来自环境变量，仓库内只保留 .env.example。
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  jwt: {
    adminSecret: string;
    customerSecret: string;
    adminExpiresIn: string;
    customerExpiresIn: string;
  };
  database: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  storage: {
    /** local = 受控文件存储（开发/测试）；oss = 对象存储（正式，需商家授权后接入） */
    driver: 'local' | 'oss';
    /** 可写存储根：后台新上传的素材落在这里 */
    localRoot: string;
    /**
     * 只读媒体根：商品目录已生成的图片（build_media.py 产物）。
     * 与 localRoot 分开，便于容器内把素材以只读方式挂载（ro），
     * 同时保留一个可写卷给新上传的文件。
     * 留空表示不额外挂载媒体目录（此时 localRoot 同时承担素材目录）。
     */
    mediaRoot: string;
    publicBaseUrl: string;
  };
  wechat: {
    appId: string;
    appSecret: string;
    /** true 时启用仅供开发/测试的模拟顾客登录 */
    mockAuth: boolean;
  };
  payment: {
    /** V1 固定为 false：真实微信支付需商家明确批准后单独实现 */
    enabled: boolean;
  };
  corsOrigins: string[];
}

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export const configuration = (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: num(process.env.PORT, 3000),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  jwt: {
    adminSecret: process.env.JWT_ADMIN_SECRET ?? 'dev-only-admin-secret-change-me',
    customerSecret: process.env.JWT_CUSTOMER_SECRET ?? 'dev-only-customer-secret-change-me',
    adminExpiresIn: process.env.JWT_ADMIN_EXPIRES_IN ?? '12h',
    customerExpiresIn: process.env.JWT_CUSTOMER_EXPIRES_IN ?? '30d',
  },
  database: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    username: process.env.DB_USERNAME ?? 'qinyang',
    password: process.env.DB_PASSWORD ?? 'qinyang',
    database: process.env.DB_DATABASE ?? 'qinyang_mall',
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER as 'local' | 'oss') ?? 'local',
    localRoot: process.env.STORAGE_LOCAL_ROOT ?? './storage',
    mediaRoot: process.env.STORAGE_MEDIA_ROOT ?? '',
    publicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL ?? 'http://127.0.0.1:3000/static',
  },
  wechat: {
    appId: process.env.WECHAT_APP_ID ?? '',
    appSecret: process.env.WECHAT_APP_SECRET ?? '',
    mockAuth: bool(process.env.WECHAT_MOCK_AUTH, true),
  },
  payment: {
    enabled: bool(process.env.PAYMENT_ENABLED, false),
  },
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
});
