import { Injectable, Logger } from '@nestjs/common';
import type { DependencyCheck, ReadinessResponse } from '@tienlen/shared';
import { describeError } from '../common/errors/describe-error';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const DEPENDENCY_CHECK_TIMEOUT_MS = 2_000;

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async readiness(): Promise<ReadinessResponse> {
    const [database, redis] = await Promise.all([
      this.check('database', async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      this.check('redis', () => this.redis.ping()),
    ]);
    const status = database.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded';
    return { status, checks: { database, redis } };
  }

  private async check(name: string, probe: () => Promise<void>): Promise<DependencyCheck> {
    const startedAt = performance.now();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        probe(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timed out')), DEPENDENCY_CHECK_TIMEOUT_MS);
        }),
      ]);
      return { status: 'up', latencyMs: elapsed(startedAt) };
    } catch (error) {
      // Details stay in server logs; the public response only says "down".
      this.logger.warn(`Readiness check failed for ${name}: ${describeError(error)}`);
      return { status: 'down', latencyMs: elapsed(startedAt) };
    } finally {
      clearTimeout(timer);
    }
  }
}

function elapsed(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}
