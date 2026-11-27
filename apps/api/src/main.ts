import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { mountStaticAssets } from './common/static-assets';
import { configuration } from './config/configuration';
import { assertProductionConfigOrThrow } from './config/production-guard';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const config = app.get(ConfigService);

  // 生产环境启动闸门：默认密钥 / 模拟登录 / 缺 AppID 一律拒绝启动
  assertProductionConfigOrThrow(configuration());

  app.setGlobalPrefix(config.get<string>('apiPrefix') ?? 'api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // 多余字段直接报错而不是静默剥离：
      // 静默剥离会掩盖「前端多传了字段」这类契约漂移，排障时极难发现。
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

  /**
   * 响应压缩。
   *
   * 后台走 nginx（那边开了 gzip），但**小程序是直连 API 容器的**，
   * 整条顾客侧链路不经过 nginx —— 此前顾客拿到的都是明文 JSON。
   * 商品列表、申请列表这类 JSON 压缩比通常在 8–12 倍，
   * 压缩后首屏流量下降一个量级。
   * threshold=1024：小于 1KB 的响应不压（压了反而更大）。
   */
  app.use(compression({ threshold: 1024 }));

  // 请求 ID：便于把前后端日志对齐，且不记录任何请求体
  app.use((req: { headers: Record<string, unknown>; requestId?: string }, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    const incoming = req.headers['x-request-id'];
    req.requestId = (typeof incoming === 'string' && incoming) || randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  });

  const origins = config.get<string[]>('corsOrigins') ?? [];
  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    credentials: false,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-customer-token', 'x-admin-token', 'x-request-id'],
  });

  // 本地受控文件存储：静态目录
  // 可写存储根 + 只读媒体根共用同一前缀（后者兜底目录生成图）
  mountStaticAssets(app, {
    storageRoot: config.get<string>('storage.localRoot') ?? './storage',
    mediaRoot: config.get<string>('storage.mediaRoot') ?? '',
    publicBaseUrl: config.get<string>('storage.publicBaseUrl') ?? '',
  });

  // OpenAPI 文档只在非生产环境挂载（生产环境暴露全部接口结构没有收益）
  if (config.get<string>('nodeEnv') !== 'production') {
  const swaggerDoc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('琴扬精纺羊绒 QINYANG · 商城 V1 API')
      .setDescription(
        '定制服装商城 REST API。金额一律整数分；V1 未启用线上收款（支付接口恒返回 PAYMENT_DISABLED）。',
      )
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'admin')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'customer')
      .build(),
  );
  SwaggerModule.setup('docs', app, swaggerDoc, {
    swaggerOptions: { persistAuthorization: true },
  });
  }

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`琴扬商城 API 已启动：http://127.0.0.1:${port}/${config.get<string>('apiPrefix')}`);
  new Logger('Bootstrap').log(`OpenAPI 文档：http://127.0.0.1:${port}/docs`);
}

void bootstrap();
