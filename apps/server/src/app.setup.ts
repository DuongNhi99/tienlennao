import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX, REQUEST_ID_HEADER } from '@tienlen/shared';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { Env } from './config/env';
import { SocketIoAdapter } from './realtime/socket-io.adapter';

/** Applies global HTTP configuration. Shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  const express = app as NestExpressApplication;
  express.disable('x-powered-by');
  // Only trust X-Forwarded-For from a known number of proxies, or clients could spoof
  // their IP address and escape per-IP rate limits.
  const trustedProxies = config.get('TRUST_PROXY', { infer: true });
  if (trustedProxies > 0) express.set('trust proxy', trustedProxies);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
    exposedHeaders: [REQUEST_ID_HEADER],
  });
  app.setGlobalPrefix(API_PREFIX);
  app.useWebSocketAdapter(
    new SocketIoAdapter(
      app,
      config.get('WEB_ORIGIN', { infer: true }),
      config.get('SOCKET_IO_REDIS_ADAPTER', { infer: true })
        ? config.get('REDIS_URL', { infer: true })
        : undefined,
    ),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
