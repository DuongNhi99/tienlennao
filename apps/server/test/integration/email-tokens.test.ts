import { apiErrorSchema, authResponseSchema, messageResponseSchema } from '@tienlen/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../../src/common/crypto/tokens';
import {
  client,
  createTestApp,
  PASSWORD,
  registerUser,
  type TestContext,
  uniqueIdentity,
} from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.app.close();
});

const NEW_PASSWORD = 'matkhaumoi456';
const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe('forgot and reset password', () => {
  it('answers the same way for unknown and known emails', async () => {
    const { email, ip } = await registerUser(ctx.server);
    const http = client(ctx.server, ip);
    const unknownEmail = `nobody-${email}`;
    const known = await http.post('/api/v1/auth/forgot-password').send({ email }).expect(202);
    const unknown = await http
      .post('/api/v1/auth/forgot-password')
      .send({ email: unknownEmail })
      .expect(202);
    expect(messageResponseSchema.parse(unknown.body)).toEqual(known.body);
    await ctx.mail.tokenFor(email, /Đặt lại mật khẩu/);
    expect(ctx.mail.sent.some((m) => m.to === unknownEmail)).toBe(false);
  });

  it('resets the password once, signs out every device, and verifies the email', async () => {
    const { http, email, ip, userId } = await registerUser(ctx.server);
    const anon = client(ctx.server, ip);
    await anon.post('/api/v1/auth/forgot-password').send({ email }).expect(202);
    const token = await ctx.mail.tokenFor(email, /Đặt lại mật khẩu/);

    // Only the hash is stored.
    const stored = await ctx.prisma.passwordResetToken.findFirstOrThrow({ where: { userId } });
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toContain(token);

    await anon
      .post('/api/v1/auth/reset-password')
      .send({ token, password: NEW_PASSWORD })
      .expect(200);

    await http.get('/api/v1/auth/me').expect(401); // existing session revoked
    await anon.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(401);
    const login = await anon
      .post('/api/v1/auth/login')
      .send({ email, password: NEW_PASSWORD })
      .expect(200);
    expect(authResponseSchema.parse(login.body).user.emailVerified).toBe(true);

    const reuse = await anon
      .post('/api/v1/auth/reset-password')
      .send({ token, password: 'matkhaukhac789' })
      .expect(400);
    expect(errorCode(reuse.body)).toBe('INVALID_TOKEN');
  });

  it('only accepts the most recent link, and only before it expires', async () => {
    const { email, ip, userId } = await registerUser(ctx.server);
    const anon = client(ctx.server, ip);
    await anon.post('/api/v1/auth/forgot-password').send({ email }).expect(202);
    const first = await ctx.mail.tokenFor(email, /Đặt lại mật khẩu/);
    await anon.post('/api/v1/auth/forgot-password').send({ email }).expect(202);
    const second = await ctx.mail.tokenFor(email, /Đặt lại mật khẩu/, 2);
    expect(second).not.toBe(first);

    const superseded = await anon
      .post('/api/v1/auth/reset-password')
      .send({ token: first, password: NEW_PASSWORD })
      .expect(400);
    expect(errorCode(superseded.body)).toBe('INVALID_TOKEN');

    await ctx.prisma.passwordResetToken.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await anon
      .post('/api/v1/auth/reset-password')
      .send({ token: second, password: NEW_PASSWORD })
      .expect(400);
  });

  it('accepts a reset only once when two requests race', async () => {
    const { email, ip } = await registerUser(ctx.server);
    const anon = client(ctx.server, ip);
    await anon.post('/api/v1/auth/forgot-password').send({ email }).expect(202);
    const token = await ctx.mail.tokenFor(email, /Đặt lại mật khẩu/);
    const results = await Promise.all(
      ['matkhaumot111', 'matkhauhai222'].map((password) =>
        anon.post('/api/v1/auth/reset-password').send({ token, password }),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  });

  it('silently stops sending after 3 requests per hour for one email', async () => {
    const { email } = await registerUser(ctx.server);
    for (let i = 0; i < 5; i += 1) {
      await client(ctx.server, uniqueIdentity().ip)
        .post('/api/v1/auth/forgot-password')
        .send({ email })
        .expect(202);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(ctx.mail.sent.filter((m) => m.to === email && /Đặt lại/.test(m.subject))).toHaveLength(
      3,
    );
  });
});

describe('email verification', () => {
  it('verifies with the emailed link, once', async () => {
    const { http, email } = await registerUser(ctx.server);
    const token = await ctx.mail.tokenFor(email, /Xác minh/);
    // The link works without being signed in (it may be opened on another device).
    await request(ctx.server).post('/api/v1/auth/verify-email').send({ token }).expect(200);
    const me = await http.get('/api/v1/auth/me').expect(200);
    expect(authResponseSchema.parse(me.body).user.emailVerified).toBe(true);
    const reuse = await request(ctx.server)
      .post('/api/v1/auth/verify-email')
      .send({ token })
      .expect(400);
    expect(errorCode(reuse.body)).toBe('INVALID_TOKEN');

    const resend = await http.post('/api/v1/auth/resend-verification').expect(202);
    expect(messageResponseSchema.parse(resend.body).message).toMatch(/đã được xác minh/);
  });

  it('resends a new link, invalidating the previous one', async () => {
    const { http, email } = await registerUser(ctx.server);
    const first = await ctx.mail.tokenFor(email, /Xác minh/);
    await http.post('/api/v1/auth/resend-verification').expect(202);
    const second = await ctx.mail.tokenFor(email, /Xác minh/, 2);
    expect(second).not.toBe(first);
    await request(ctx.server).post('/api/v1/auth/verify-email').send({ token: first }).expect(400);
    await request(ctx.server).post('/api/v1/auth/verify-email').send({ token: second }).expect(200);
  });

  it('rejects malformed tokens without touching the database', async () => {
    const res = await request(ctx.server)
      .post('/api/v1/auth/verify-email')
      .send({ token: 'short' })
      .expect(400);
    expect(errorCode(res.body)).toBe('VALIDATION_ERROR');
  });
});
