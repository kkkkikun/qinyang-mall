import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const config = app.get(ConfigService);

  app.setGlobalPrefix(config.get<string>('apiPrefix') ?? 'api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      validationError: { target: false, value: false },
    }),
  );

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
  const storageRoot = config.get<string>('storage.localRoot') ?? './storage';
  const publicBaseUrl = config.get<string>('storage.publicBaseUrl') ?? '';
  const staticPrefix = publicBaseUrl.replace(/^https?:\/\/[^/]+/, '') || '/static';
  app.useStaticAssets(storageRoot, { prefix: staticPrefix });

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

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`琴扬商城 API 已启动：http://127.0.0.1:${port}/${config.get<string>('apiPrefix')}`);
  new Logger('Bootstrap').log(`OpenAPI 文档：http://127.0.0.1:${port}/docs`);
}

void bootstrap();
