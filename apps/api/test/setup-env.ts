/**
 * 测试环境变量。必须在任何应用模块被导入前生效，
 * 因此通过 jest `setupFiles` 注入。
 */
process.env.NODE_ENV = 'test';
process.env.API_PREFIX = 'api/v1';
process.env.DB_HOST = process.env.DB_HOST ?? '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT ?? '13316';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'qinyang';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'qinyang';
// 测试一律使用独立测试库，绝不复用开发库
process.env.TEST_DB_DATABASE = process.env.TEST_DB_DATABASE ?? 'qinyang_mall_test';
process.env.DB_DATABASE = process.env.TEST_DB_DATABASE;
process.env.JWT_ADMIN_SECRET = 'test-admin-secret';
process.env.JWT_CUSTOMER_SECRET = 'test-customer-secret';
process.env.JWT_ADMIN_EXPIRES_IN = '1h';
process.env.JWT_CUSTOMER_EXPIRES_IN = '1h';
process.env.WECHAT_MOCK_AUTH = 'true';
process.env.PAYMENT_ENABLED = 'false';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_ROOT = './.test-storage';
// 测试不挂载只读媒体目录，避免受宿主环境影响
process.env.STORAGE_MEDIA_ROOT = '';
process.env.STORAGE_PUBLIC_BASE_URL = 'http://127.0.0.1:3000/static';
process.env.CORS_ORIGINS = 'http://127.0.0.1:5173';
