import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { describeError } from '../common/errors/describe-error';
import type { Env } from '../config/env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    super({ datasourceUrl: config.get('DATABASE_URL', { infer: true }) });
  }

  async onModuleInit(): Promise<void> {
    // Boot even if the database is temporarily unreachable: Prisma reconnects lazily and the
    // readiness probe reports the outage, so orchestrators stop routing traffic here.
    try {
      await this.$connect();
    } catch (error) {
      this.logger.warn(`Database unavailable at startup: ${describeError(error)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
