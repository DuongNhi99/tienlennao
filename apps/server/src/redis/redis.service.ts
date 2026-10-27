import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { describeError } from '../common/errors/describe-error';
import type { Env } from '../config/env';

const ERROR_LOG_INTERVAL_MS = 30_000;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private lastErrorLoggedAt = 0;
  readonly client: Redis;

  constructor(config: ConfigService<Env, true>) {
    this.client = new Redis(config.get('REDIS_URL', { infer: true }), {
      lazyConnect: true,
      connectTimeout: 2_000,
      maxRetriesPerRequest: 1,
      // Fail fast while disconnected instead of queueing commands indefinitely.
      enableOfflineQueue: false,
    });
    // ioredis keeps reconnecting in the background; throttle the resulting error logs.
    // The URL is never logged because it may contain credentials.
    this.client.on('error', (error: Error) => {
      const now = Date.now();
      if (now - this.lastErrorLoggedAt >= ERROR_LOG_INTERVAL_MS) {
        this.lastErrorLoggedAt = now;
        this.logger.warn(`Redis connection error: ${describeError(error)}`);
      }
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
    } catch {
      // Already reported by the error listener; readiness will report Redis as down.
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }

  async ping(): Promise<void> {
    const reply: string = await this.client.ping();
    if (reply !== 'PONG') {
      throw new Error('Unexpected PING reply');
    }
  }
}
