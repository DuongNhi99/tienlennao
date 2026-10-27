import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { apiErrorSchema, livenessResponseSchema, readinessResponseSchema } from '@tienlen/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';

// Dependencies are stubbed so these tests exercise HTTP wiring (prefix, filters, request IDs,
// health semantics) without requiring PostgreSQL or Redis.
const prisma = { $queryRaw: vi.fn(), $connect: vi.fn(), $disconnect: vi.fn() };
const redis = { ping: vi.fn(), onModuleInit: vi.fn(), onModuleDestroy: vi.fn() };

describe('HTTP application (e2e, stubbed dependencies)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue(redis)
      .compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    redis.ping.mockResolvedValue(undefined);
  });

  it('GET /api/v1/health/live returns ok and a generated request ID', async () => {
    const res = await request(server).get('/api/v1/health/live').expect(200);
    expect(livenessResponseSchema.parse(res.body).status).toBe('ok');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a well-formed incoming request ID and replaces a malformed one', async () => {
    const good = await request(server)
      .get('/api/v1/health/live')
      .set('x-request-id', 'client-req-12345');
    expect(good.headers['x-request-id']).toBe('client-req-12345');

    const bad = await request(server).get('/api/v1/health/live').set('x-request-id', '<script>');
    expect(bad.headers['x-request-id']).not.toBe('<script>');
  });

  it('GET /api/v1/health/ready returns 200 when all dependencies are up', async () => {
    const res = await request(server).get('/api/v1/health/ready').expect(200);
    const body = readinessResponseSchema.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.checks.database.status).toBe('up');
    expect(body.checks.redis.status).toBe('up');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /api/v1/health/ready returns 503 without leaking error details when Redis is down', async () => {
    redis.ping.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:6379'));
    const res = await request(server).get('/api/v1/health/ready').expect(503);
    const body = readinessResponseSchema.parse(res.body);
    expect(body).toMatchObject({
      status: 'degraded',
      checks: { database: { status: 'up' }, redis: { status: 'down' } },
    });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('unknown routes return the shared error envelope with a Vietnamese message', async () => {
    const res = await request(server).get('/api/v1/does-not-exist').expect(404);
    const body = apiErrorSchema.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Không tìm thấy nội dung yêu cầu.');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('routes are only served under the /api/v1 prefix', async () => {
    await request(server).get('/health/live').expect(404);
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(server).get('/api/v1/health/live');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('allows CORS with credentials only for the configured web origin', async () => {
    const allowed = await request(server)
      .get('/api/v1/health/live')
      .set('Origin', 'http://localhost:3000');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(server)
      .get('/api/v1/health/live')
      .set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
