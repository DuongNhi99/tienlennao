import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { API_PREFIX, REQUEST_ID_HEADER } from '@tienlen/shared';
import { LoggerModule } from 'nestjs-pino';
import { type Env, validateEnv } from './config/env';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { PlayModule } from './game/play.module';
import { HistoryModule } from './history/history.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Commands run from apps/server; the monorepo keeps a single .env at the root.
      // Real environment variables always take precedence over file values.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          // Accept a well-formed upstream correlation ID, otherwise generate one.
          genReqId: (req, res) => {
            const incoming = req.headers[REQUEST_ID_HEADER];
            const id =
              typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
                ? incoming
                : randomUUID();
            res.setHeader(REQUEST_ID_HEADER, id);
            return id;
          },
          // Never log credentials or session cookies.
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
            censor: '[REDACTED]',
          },
          autoLogging: {
            ignore: (req) => req.url?.startsWith(`/${API_PREFIX}/health`) ?? false,
          },
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    PlayModule,
    HistoryModule,
    NotificationsModule,
    AdminModule,
  ],
})
export class AppModule {}
