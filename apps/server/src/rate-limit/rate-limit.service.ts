import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { describeError } from '../common/errors/describe-error';
import { RedisService } from '../redis/redis.service';

export interface RateLimitRule {
  /** Maximum requests per window. */
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const MEMORY_MAX_KEYS = 10_000;

/**
 * Fixed-window counters. Redis is shared by every API instance; when it is unreachable the
 * service falls back to per-process memory so that limits still apply (approximately) instead
 * of either blocking every login or disabling protection.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly memory = new Map<string, { count: number; resetAt: number }>();
  private fallbackWarned = false;

  constructor(private readonly redis: RedisService) {}

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    try {
      return await this.consumeRedis(`ratelimit:${key}`, rule);
    } catch (error) {
      if (!this.fallbackWarned) {
        this.fallbackWarned = true;
        this.logger.warn(`Rate limiting uses in-memory counters: ${describeError(error)}`);
      }
      return this.consumeMemory(key, rule);
    }
  }

  /** Throws RATE_LIMITED (429) when the limit is exceeded. */
  async enforce(key: string, rule: RateLimitRule): Promise<void> {
    const result = await this.consume(key, rule);
    if (!result.allowed) {
      throw new AppException('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS, undefined, undefined, {
        'Retry-After': String(result.retryAfterSeconds),
      });
    }
  }

  private async consumeRedis(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const results = await this.redis.client
      .multi()
      .incr(key)
      .expire(key, rule.windowSeconds, 'NX')
      .ttl(key)
      .exec();
    if (!results) throw new Error('Redis transaction aborted');
    const [[incrError, count], , [ttlError, ttl]] = results as [
      [Error | null, number],
      unknown,
      [Error | null, number],
    ];
    const commandError = incrError ?? ttlError;
    if (commandError) throw commandError;
    return {
      allowed: count <= rule.limit,
      retryAfterSeconds: ttl > 0 ? ttl : rule.windowSeconds,
    };
  }

  private consumeMemory(key: string, rule: RateLimitRule): RateLimitResult {
    const now = Date.now();
    let entry = this.memory.get(key);
    if (!entry || entry.resetAt <= now) {
      if (this.memory.size >= MEMORY_MAX_KEYS) this.pruneMemory(now);
      entry = { count: 0, resetAt: now + rule.windowSeconds * 1000 };
      this.memory.set(key, entry);
    }
    entry.count += 1;
    return {
      allowed: entry.count <= rule.limit,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  private pruneMemory(now: number): void {
    for (const [key, entry] of this.memory) {
      if (entry.resetAt <= now) this.memory.delete(key);
    }
    // Still full of live windows: drop the oldest insertions rather than grow without bound.
    for (const key of this.memory.keys()) {
      if (this.memory.size < MEMORY_MAX_KEYS) break;
      this.memory.delete(key);
    }
  }
}
