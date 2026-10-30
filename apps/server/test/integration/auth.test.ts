import { apiErrorSchema, authResponseSchema, SESSION_COOKIE_NAME } from '@tienlen/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  client,
  createTestApp,
  PASSWORD,
  registerUser,
  sessionCookie,
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

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe('registration', () => {
  it('creates the account, profile and wallet, and signs the user in', async () => {
    const id = uniqueIdentity();
    const http = client(ctx.server, id.ip);
    const res = await http
      .post('/api/v1/auth/register')
      // A client-supplied balance or role must be ignored.
      .send({
        displayName: `  ${id.displayName}  `,
        email: `  ${id.email.toUpperCase()} `,
        password: PASSWORD,
        acceptTerms: true,
        balance: 999_999,
        role: 'ADMIN',
      })
      .expect(201);

    const { user } = authResponseSchema.parse(res.body);
    expect(user).toEqual({
      id: expect.any(String) as string,
      email: id.email,
      displayName: id.displayName,
      role: 'PLAYER',
      emailVerified: false,
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash/i);

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//);

    const stored = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { wallet: { include: { transactions: true } }, profile: true },
    });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.wallet?.balance).toBe(10_000);
    expect(stored.wallet?.transactions).toEqual([
      expect.objectContaining({ type: 'INITIAL_BONUS', amount: 10_000, balanceAfter: 10_000 }),
    ]);

    // The cookie authenticates subsequent requests.
    const me = await http.get('/api/v1/auth/me').expect(200);
    expect(authResponseSchema.parse(me.body).user.id).toBe(user.id);

    // A verification email was sent.
    await expect(ctx.mail.tokenFor(id.email, /Xác minh/)).resolves.toBeTruthy();
  });

  it('rejects a duplicate email regardless of case', async () => {
    const { email } = await registerUser(ctx.server);
    const other = uniqueIdentity();
    const res = await client(ctx.server, other.ip)
      .post('/api/v1/auth/register')
      .send({
        displayName: other.displayName,
        email: email.toUpperCase(),
        password: PASSWORD,
        acceptTerms: true,
      })
      .expect(409);
    expect(errorCode(res.body)).toBe('EMAIL_ALREADY_EXISTS');
    expect(await ctx.prisma.user.count({ where: { email } })).toBe(1);
  });

  it('validates input on the server with Vietnamese messages', async () => {
    const id = uniqueIdentity();
    const res = await client(ctx.server, id.ip)
      .post('/api/v1/auth/register')
      .send({ displayName: 'a', email: 'not-an-email', password: 'short', acceptTerms: false })
      .expect(400);
    const { error } = apiErrorSchema.parse(res.body);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect([...new Set(error.details?.map((d) => d.path))].sort()).toEqual([
      'acceptTerms',
      'displayName',
      'email',
      'password',
    ]);
    expect(error.details?.find((d) => d.path === 'email')?.message).toBe('Email không hợp lệ.');
  });
});

describe('login', () => {
  it('returns the same generic error for a wrong password and an unknown email', async () => {
    const { email, ip } = await registerUser(ctx.server);
    const http = client(ctx.server, ip);
    const wrong = await http
      .post('/api/v1/auth/login')
      .send({ email, password: 'sai-mat-khau-1' })
      .expect(401);
    const unknown = await http
      .post('/api/v1/auth/login')
      .send({ email: `nobody-${email}`, password: PASSWORD })
      .expect(401);
    expect(errorCode(wrong.body)).toBe('INVALID_CREDENTIALS');
    expect(apiErrorSchema.parse(unknown.body).error.message).toBe(
      apiErrorSchema.parse(wrong.body).error.message,
    );
    expect(sessionCookie(wrong)).toBeUndefined();
  });

  it('signs in with normalized email, records the login, and issues a new session', async () => {
    const { email, ip, userId } = await registerUser(ctx.server);
    const res = await client(ctx.server, ip)
      .post('/api/v1/auth/login')
      .send({ email: ` ${email.toUpperCase()}`, password: PASSWORD })
      .expect(200);
    expect(authResponseSchema.parse(res.body).user.id).toBe(userId);
    expect(sessionCookie(res)).toBeDefined();
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.lastLoginAt).not.toBeNull();
    expect(await ctx.prisma.session.count({ where: { userId, revokedAt: null } })).toBe(2);
  });

  it('rate-limits repeated attempts for one email with 429 and Retry-After', async () => {
    const { email } = await registerUser(ctx.server);
    let last: request.Response | undefined;
    // Spread over several IPs, so only the per-email limit (10 per 15 minutes) applies.
    for (let i = 0; i < 11; i += 1) {
      last = await client(ctx.server, uniqueIdentity().ip)
        .post('/api/v1/auth/login')
        .send({ email, password: 'sai-mat-khau-1' });
    }
    expect(last?.status).toBe(429);
    expect(errorCode(last?.body)).toBe('RATE_LIMITED');
    expect(Number(last?.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('sessions and protected routes', () => {
  it('requires a session for protected routes', async () => {
    const res = await request(ctx.server).get('/api/v1/users/me').expect(401);
    expect(errorCode(res.body)).toBe('UNAUTHENTICATED');
  });

  it('rejects an unknown token with SESSION_EXPIRED and clears the cookie', async () => {
    const res = await request(ctx.server)
      .get('/api/v1/auth/me')
      .set('Cookie', `${SESSION_COOKIE_NAME}=not-a-real-token`)
      .expect(401);
    expect(errorCode(res.body)).toBe('SESSION_EXPIRED');
    expect(sessionCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('rejects an expired session', async () => {
    const { http, userId } = await registerUser(ctx.server);
    await ctx.prisma.session.updateMany({ where: { userId }, data: { expiresAt: new Date(0) } });
    const res = await http.get('/api/v1/auth/me').expect(401);
    expect(errorCode(res.body)).toBe('SESSION_EXPIRED');
  });

  it('extends the sliding expiry and re-issues the cookie after inactivity', async () => {
    const { http, userId } = await registerUser(ctx.server);
    const soon = new Date(Date.now() + 60_000);
    await ctx.prisma.session.updateMany({
      where: { userId },
      data: { lastSeenAt: new Date(Date.now() - 10 * 60_000), expiresAt: soon },
    });
    const res = await http.get('/api/v1/auth/me').expect(200);
    expect(sessionCookie(res)).toBeDefined();
    const session = await ctx.prisma.session.findFirstOrThrow({ where: { userId } });
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 3600_000);
  });

  it('logout revokes the session; a reused cookie no longer works', async () => {
    const { http, userId, cookie } = await registerUser(ctx.server);
    await http.post('/api/v1/auth/logout').expect(204);
    expect(await ctx.prisma.session.count({ where: { userId, revokedAt: null } })).toBe(0);
    // Replaying the old cookie (e.g. copied before logout) fails.
    const replay = await request(ctx.server)
      .get('/api/v1/auth/me')
      .set('Cookie', cookie)
      .expect(401);
    expect(errorCode(replay.body)).toBe('SESSION_EXPIRED');
  });

  it('logout-all signs out every device', async () => {
    const { http, email, ip, userId } = await registerUser(ctx.server);
    const otherDevice = client(ctx.server, ip);
    await otherDevice.post('/api/v1/auth/login').send({ email, password: PASSWORD }).expect(200);
    await http.post('/api/v1/auth/logout-all').expect(204);
    await otherDevice.get('/api/v1/auth/me').expect(401);
    await http.get('/api/v1/auth/me').expect(401);
    expect(await ctx.prisma.session.count({ where: { userId, revokedAt: null } })).toBe(0);
  });

  it('logout without a session still succeeds', async () => {
    await request(ctx.server).post('/api/v1/auth/logout').expect(204);
  });
});

describe('CSRF protection', () => {
  it('rejects state-changing requests from other origins', async () => {
    const { http } = await registerUser(ctx.server);
    const evil = await http
      .post('/api/v1/auth/logout-all')
      .set('Origin', 'https://evil.example')
      .expect(403);
    expect(errorCode(evil.body)).toBe('FORBIDDEN');
    await http.post('/api/v1/auth/logout-all').set('Sec-Fetch-Site', 'cross-site').expect(403);
    // Still signed in: neither request had any effect.
    await http.get('/api/v1/auth/me').expect(200);
    await http.post('/api/v1/auth/logout-all').set('Origin', 'http://localhost:3000').expect(204);
  });

  it('allows safe methods from any origin (CORS still governs what they can read)', async () => {
    await request(ctx.server)
      .get('/api/v1/health/live')
      .set('Origin', 'https://evil.example')
      .expect(200);
  });
});
