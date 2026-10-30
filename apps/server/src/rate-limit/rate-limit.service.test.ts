import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app.exception';
import type { RedisService } from '../redis/redis.service';
import { RateLimitService } from './rate-limit.service';

const rule = { limit: 2, windowSeconds: 60 };

function redisReturning(count: number, ttl: number): RedisService {
  const chain = {
    incr: () => chain,
    expire: () => chain,
    ttl: () => chain,
    exec: () =>
      Promise.resolve([
        [null, count],
        [null, 1],
        [null, ttl],
      ]),
  };
  return { client: { multi: () => chain } } as unknown as RedisService;
}

const redisDown = {
  client: {
    multi: () => {
      throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
    },
  },
} as unknown as RedisService;

afterEach(() => {
  vi.useRealTimers();
});

describe('RateLimitService', () => {
  it('uses the Redis counter and its TTL', async () => {
    const service = new RateLimitService(redisReturning(3, 42));
    await expect(service.consume('k', rule)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 42,
    });
  });

  it('falls back to in-memory counters when Redis is unavailable', async () => {
    vi.useFakeTimers();
    const service = new RateLimitService(redisDown);
    expect((await service.consume('k', rule)).allowed).toBe(true);
    expect((await service.consume('k', rule)).allowed).toBe(true);
    const blocked = await service.consume('k', rule);
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 60 });
    // Other keys are independent.
    expect((await service.consume('other', rule)).allowed).toBe(true);
    // A new window starts after the old one ends.
    vi.advanceTimersByTime(60_001);
    expect((await service.consume('k', rule)).allowed).toBe(true);
  });

  it('enforce() throws RATE_LIMITED with a Retry-After header', async () => {
    const service = new RateLimitService(redisReturning(5, 30));
    const error = await service.enforce('k', rule).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('RATE_LIMITED');
    expect((error as AppException).getStatus()).toBe(429);
    expect((error as AppException).headers).toEqual({ 'Retry-After': '30' });
  });
});
