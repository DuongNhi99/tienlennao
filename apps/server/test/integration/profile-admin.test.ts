import {
  adminUserStatusResponseSchema,
  apiErrorSchema,
  currentUserSummarySchema,
  userStatsSchema,
} from '@tienlen/shared';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, createTestApp, PASSWORD, registerUser, type TestContext } from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});

afterAll(async () => {
  await ctx.app.close();
});

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } },
  })
    .png()
    .toBuffer();
}

describe('profile', () => {
  it('returns the summary with the server-side balance and zeroed stats', async () => {
    const { http, userId, displayName } = await registerUser(ctx.server);
    const me = currentUserSummarySchema.parse(
      (await http.get('/api/v1/users/me').expect(200)).body,
    );
    expect(me).toMatchObject({
      id: userId,
      displayName,
      avatarUrl: null,
      balance: 10_000,
      matchesPlayed: 0,
      matchesWon: 0,
    });
    const stats = userStatsSchema.parse(
      (await http.get('/api/v1/users/me/stats').expect(200)).body,
    );
    expect(stats).toEqual({ matchesPlayed: 0, matchesWon: 0, matchesLost: 0, winRate: 0 });
  });

  it('computes stats from the profile counters', async () => {
    const { http, userId } = await registerUser(ctx.server);
    await ctx.prisma.userProfile.update({
      where: { userId },
      data: { matchesPlayed: 7, matchesWon: 2 },
    });
    const stats = userStatsSchema.parse(
      (await http.get('/api/v1/users/me/stats').expect(200)).body,
    );
    expect(stats).toEqual({ matchesPlayed: 7, matchesWon: 2, matchesLost: 5, winRate: 28.6 });
  });

  it('updates the display name with server-side validation', async () => {
    const { http } = await registerUser(ctx.server);
    const updated = await http
      .patch('/api/v1/users/me')
      .send({ displayName: '  Tiến   Lên  ' })
      .expect(200);
    expect(currentUserSummarySchema.parse(updated.body).displayName).toBe('Tiến Lên');
    const invalid = await http
      .patch('/api/v1/users/me')
      .send({ displayName: '<script>' })
      .expect(400);
    expect(errorCode(invalid.body)).toBe('VALIDATION_ERROR');
    // Other fields (e.g. a balance) are not accepted through the profile endpoint.
    await http.patch('/api/v1/users/me').send({ displayName: 'Hợp lệ', balance: 1 }).expect(200);
    const me = currentUserSummarySchema.parse(
      (await http.get('/api/v1/users/me').expect(200)).body,
    );
    expect(me.balance).toBe(10_000);
  });
});

describe('avatar upload', () => {
  it('re-encodes a valid image to a 256×256 WebP and serves it', async () => {
    const { http } = await registerUser(ctx.server);
    const res = await http
      .put('/api/v1/users/me/avatar')
      .attach('avatar', await png(600, 400), { filename: 'me.png', contentType: 'image/png' })
      .expect(200);
    const { avatarUrl } = currentUserSummarySchema.parse(res.body);
    expect(avatarUrl).toMatch(/\/api\/v1\/avatars\/[0-9a-f-]{36}\.webp$/);

    const path = new URL(avatarUrl!).pathname;
    const image = await request(ctx.server).get(path).buffer(true).expect(200);
    expect(image.headers['content-type']).toBe('image/webp');
    expect(image.headers['cross-origin-resource-policy']).toBe('cross-origin');
    const meta = await sharp(image.body as Buffer).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 256, height: 256 });

    // Replacing the avatar deletes the previous file.
    await http
      .put('/api/v1/users/me/avatar')
      .attach('avatar', await png(64, 64), { filename: 'b.png', contentType: 'image/png' })
      .expect(200);
    await request(ctx.server).get(path).expect(404);
  });

  it('rejects files whose content is not an image, whatever their declared type', async () => {
    const { http } = await registerUser(ctx.server);
    const fake = Buffer.from('<?php echo "not an image"; ?>');
    const res = await http
      .put('/api/v1/users/me/avatar')
      .attach('avatar', fake, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(400);
    expect(errorCode(res.body)).toBe('VALIDATION_ERROR');
    await http
      .put('/api/v1/users/me/avatar')
      .attach('avatar', await png(32, 32), { filename: 'a.svg', contentType: 'image/svg+xml' })
      .expect(400);
  });

  it('rejects files over 2 MB', async () => {
    const { http } = await registerUser(ctx.server);
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 1);
    const res = await http
      .put('/api/v1/users/me/avatar')
      .attach('avatar', big, { filename: 'big.png', contentType: 'image/png' });
    expect(res.status).toBe(413);
    expect(errorCode(res.body)).toBe('VALIDATION_ERROR');
  });

  it('removes the avatar', async () => {
    const { http } = await registerUser(ctx.server);
    await http
      .put('/api/v1/users/me/avatar')
      .attach('avatar', await png(64, 64), { filename: 'a.png', contentType: 'image/png' })
      .expect(200);
    const res = await http.delete('/api/v1/users/me/avatar').expect(200);
    expect(currentUserSummarySchema.parse(res.body).avatarUrl).toBeNull();
  });

  it('never serves paths outside the avatar directory', async () => {
    await request(ctx.server).get('/api/v1/avatars/..%2F..%2Fpackage.json').expect(404);
    await request(ctx.server).get('/api/v1/avatars/not-a-uuid.webp').expect(404);
  });
});

describe('admin account status', () => {
  async function makeAdmin() {
    const admin = await registerUser(ctx.server);
    await ctx.prisma.user.update({ where: { id: admin.userId }, data: { role: 'ADMIN' } });
    return admin;
  }

  it('is forbidden for players', async () => {
    const player = await registerUser(ctx.server);
    const target = await registerUser(ctx.server);
    const res = await player.http
      .patch(`/api/v1/admin/users/${target.userId}/status`)
      .send({ status: 'SUSPENDED', reason: 'thử nghiệm' })
      .expect(403);
    expect(errorCode(res.body)).toBe('FORBIDDEN');
  });

  it('suspends an account: sessions are revoked, login is refused, the action is audited', async () => {
    const admin = await makeAdmin();
    const target = await registerUser(ctx.server);

    const res = await admin.http
      .patch(`/api/v1/admin/users/${target.userId}/status`)
      .send({ status: 'SUSPENDED', reason: 'Spam trong phòng chat' })
      .expect(200);
    expect(adminUserStatusResponseSchema.parse(res.body)).toEqual({
      userId: target.userId,
      status: 'SUSPENDED',
      revokedSessions: 1,
    });

    await target.http.get('/api/v1/auth/me').expect(401);
    const login = await client(ctx.server, target.ip)
      .post('/api/v1/auth/login')
      .send({ email: target.email, password: PASSWORD })
      .expect(403);
    expect(errorCode(login.body)).toBe('ACCOUNT_SUSPENDED');

    const audit = await ctx.prisma.adminAuditLog.findFirstOrThrow({
      where: { targetId: target.userId },
    });
    expect(audit).toMatchObject({
      actorId: admin.userId,
      action: 'USER_SUSPENDED',
      targetType: 'USER',
      reason: 'Spam trong phòng chat',
    });

    await admin.http
      .patch(`/api/v1/admin/users/${target.userId}/status`)
      .send({ status: 'ACTIVE', reason: 'Đã xác minh' })
      .expect(200);
    await client(ctx.server, target.ip)
      .post('/api/v1/auth/login')
      .send({ email: target.email, password: PASSWORD })
      .expect(200);
  });

  it('blocks a session created before the suspension took effect', async () => {
    const target = await registerUser(ctx.server);
    // Suspended directly in the database (e.g. by another admin tool): the next request
    // with an existing session is refused and every session is revoked.
    await ctx.prisma.user.update({ where: { id: target.userId }, data: { status: 'SUSPENDED' } });
    const res = await target.http.get('/api/v1/users/me').expect(403);
    expect(errorCode(res.body)).toBe('ACCOUNT_SUSPENDED');
    expect(
      await ctx.prisma.session.count({ where: { userId: target.userId, revokedAt: null } }),
    ).toBe(0);
  });

  it('does not let an admin suspend themselves, and requires a reason', async () => {
    const admin = await makeAdmin();
    await admin.http
      .patch(`/api/v1/admin/users/${admin.userId}/status`)
      .send({ status: 'SUSPENDED', reason: 'tự khóa' })
      .expect(403);
    const target = await registerUser(ctx.server);
    const res = await admin.http
      .patch(`/api/v1/admin/users/${target.userId}/status`)
      .send({ status: 'SUSPENDED', reason: '' })
      .expect(400);
    expect(errorCode(res.body)).toBe('VALIDATION_ERROR');
  });
});
