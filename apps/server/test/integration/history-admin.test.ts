import { randomUUID } from 'node:crypto';
import {
  adminAuditPageSchema,
  adminMatchDetailSchema,
  adminMatchPageSchema,
  adminOverviewSchema,
  adminReportSchema,
  adminRulePresetSchema,
  adminUserSchema,
  apiErrorSchema,
  DEFAULT_GAME_RULES,
  leaderboardSchema,
  matchHistoryDetailSchema,
  matchHistoryPageSchema,
  notificationPageSchema,
  roomOptionsSchema,
} from '@tienlen/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Dealer } from '../../src/game/dealer';
import { createTestApp, registerUser, type TestContext } from './helpers';
import { playToEnd, readyRoom, TestDealer } from './play-helpers';

const API = '/api/v1';
const FEE = 100;
let ctx: TestContext;

type Player = Awaited<ReturnType<typeof registerUser>>;
const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;
const players = (count: number): Promise<Player[]> =>
  Promise.all(Array.from({ length: count }, () => registerUser(ctx.server)));

/** One finished paid match shared by the history, notification and leaderboard tests. */
let table: Player[];
let matchId: string;
let admin: Player;

beforeAll(async () => {
  ctx = await createTestApp((builder) =>
    builder.overrideProvider(Dealer).useValue(new TestDealer()),
  );
  await ctx.prisma.gameRuleConfiguration.upsert({
    where: { key_version: { key: 'default', version: 2 } },
    update: { isActive: true },
    create: {
      key: 'default',
      version: 2,
      name: 'Test preset',
      isActive: true,
      rules: DEFAULT_GAME_RULES,
      allowedEntryFees: [0, FEE, 500],
      allowedTurnTimers: [15, 30, 45],
    },
  });

  table = await players(4);
  const roomId = await readyRoom(table, FEE);
  await table[0]!.http.post(`${API}/rooms/${roomId}/start`).expect(200);
  await playToEnd(table, roomId);
  matchId = (await ctx.prisma.match.findFirstOrThrow({ where: { roomId } })).id;

  admin = (await players(1))[0]!;
  await ctx.prisma.user.update({ where: { id: admin.userId }, data: { role: 'ADMIN' } });
}, 120_000);

afterAll(async () => {
  await ctx.app.close();
});

describe('match history', () => {
  it('lists the match with placements and coins that agree with the ledger', async () => {
    const page = matchHistoryPageSchema.parse(
      (await table[1]!.http.get(`${API}/history?limit=5`).expect(200)).body,
    );
    const item = page.items.find((i) => i.matchId === matchId)!;
    expect(item).toMatchObject({ status: 'FINISHED', entryFee: FEE });
    expect(item.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(item.players.map((p) => p.placement).sort()).toEqual([1, 2, 3, 4]);
    for (const player of item.players) {
      const ledger = await ctx.prisma.walletTransaction.aggregate({
        where: { userId: player.userId, matchId },
        _sum: { amount: true },
      });
      expect(player.coinDelta).toBe(ledger._sum.amount);
    }
  });

  it('shows a public timeline without the deal, and hides the match from outsiders', async () => {
    const detail = matchHistoryDetailSchema.parse(
      (await table[2]!.http.get(`${API}/history/${matchId}`).expect(200)).body,
    );
    const types = new Set(detail.timeline.map((e) => e.type));
    expect(types.has('PLAY')).toBe(true);
    expect(detail.timeline.at(-1)!.type).toBe('MATCH_FINISHED');
    // Every card in the timeline was played in the open, each exactly once.
    const cards = detail.timeline.flatMap((e) => e.cards ?? []);
    expect(new Set(cards).size).toBe(cards.length);
    expect(JSON.stringify(detail)).not.toContain('"hands"');

    const [outsider] = await players(1);
    const res = await outsider!.http.get(`${API}/history/${matchId}`).expect(404);
    expect(errorCode(res.body)).toBe('NOT_FOUND');
  });
});

describe('notifications', () => {
  it("delivers the match result and today's reward reminder once each", async () => {
    const p = table[0]!;
    const first = notificationPageSchema.parse((await p.http.get(`${API}/notifications`)).body);
    const second = notificationPageSchema.parse((await p.http.get(`${API}/notifications`)).body);
    expect(second.items).toHaveLength(first.items.length);
    const result = first.items.find((n) => n.type === 'MATCH_RESULT')!;
    expect(result.link).toBe(`/history/${matchId}`);
    expect(first.items.filter((n) => n.type === 'DAILY_REWARD')).toHaveLength(1);
    expect(first.unreadCount).toBe(first.items.length);

    await p.http.post(`${API}/notifications/${result.id}/read`).expect(204);
    const afterOne = notificationPageSchema.parse((await p.http.get(`${API}/notifications`)).body);
    expect(afterOne.unreadCount).toBe(first.unreadCount - 1);
    await p.http.post(`${API}/notifications/read-all`).expect(204);
    const afterAll = notificationPageSchema.parse((await p.http.get(`${API}/notifications`)).body);
    expect(afterAll.unreadCount).toBe(0);

    // Someone else's notification cannot be touched.
    const res = await table[1]!.http.post(`${API}/notifications/${result.id}/read`).expect(404);
    expect(errorCode(res.body)).toBe('NOT_FOUND');
  });
});

describe('leaderboard', () => {
  it('ranks finished matches and leaves out win rates below the minimum', async () => {
    const winner = (
      await ctx.prisma.matchPlayer.findFirstOrThrow({ where: { matchId, placement: 1 } })
    ).userId;
    const me = table.find((p) => p.userId === winner)!;
    const board = leaderboardSchema.parse(
      (await me.http.get(`${API}/leaderboard?metric=wins&period=week`).expect(200)).body,
    );
    expect(board.since).not.toBeNull();
    expect(board.me).toMatchObject({ userId: winner, wins: 1, matchesPlayed: 1, winRate: 100 });
    expect(board.entries.some((e) => e.userId === winner)).toBe(true);
    expect(JSON.stringify(board)).not.toContain('@example.com');

    const rate = leaderboardSchema.parse(
      (await me.http.get(`${API}/leaderboard?metric=winRate&period=all`)).body,
    );
    expect(rate.minMatches).toBe(10);
    expect(rate.me).toBeNull();
  });
});

describe('reports', () => {
  it('lets a player report an opponent from a shared match, once', async () => {
    const [reporter, reported] = table as [Player, Player];
    const body = {
      matchId,
      reportedUserId: reported.userId,
      reason: 'CHEATING',
      details: 'Nghi ngờ',
    };
    const a = await reporter.http.post(`${API}/reports`).send(body).expect(201);
    const b = await reporter.http.post(`${API}/reports`).send(body).expect(201);
    expect(a.body).toEqual(b.body);
    await reporter.http
      .post(`${API}/reports`)
      .send({ ...body, reportedUserId: reporter.userId })
      .expect(400);
    const [outsider] = await players(1);
    await reporter.http
      .post(`${API}/reports`)
      .send({ ...body, reportedUserId: outsider!.userId })
      .expect(404);
  });
});

describe('admin', () => {
  it('is closed to players', async () => {
    const res = await table[0]!.http.get(`${API}/admin/overview`).expect(403);
    expect(errorCode(res.body)).toBe('FORBIDDEN');
  });

  it('shows an overview and finds users by name or ID', async () => {
    const overview = adminOverviewSchema.parse(
      (await admin.http.get(`${API}/admin/overview`).expect(200)).body,
    );
    expect(overview.users.total).toBeGreaterThanOrEqual(5);
    expect(overview.matches.finishedLast24h).toBeGreaterThanOrEqual(1);
    expect(overview.health.database).toBe('up');

    const target = table[3]!;
    const byName = adminUserSchema
      .array()
      .parse(
        (
          await admin.http
            .get(`${API}/admin/users?q=${encodeURIComponent(target.displayName)}`)
            .expect(200)
        ).body,
      );
    expect(byName.map((u) => u.id)).toContain(target.userId);
    const byId = adminUserSchema
      .array()
      .parse((await admin.http.get(`${API}/admin/users?q=${target.userId}`)).body);
    expect(byId).toHaveLength(1);
    expect(byId[0]).toMatchObject({ email: target.email, matchesPlayed: 1 });
    const matches = matchHistoryPageSchema.parse(
      (await admin.http.get(`${API}/admin/users/${target.userId}/matches`).expect(200)).body,
    );
    expect(matches.items.map((m) => m.matchId)).toContain(matchId);
  });

  it('adjusts coins once per request, with a reason, an audit entry and a notice', async () => {
    const target = table[2]!;
    const before = (await ctx.prisma.wallet.findUniqueOrThrow({ where: { userId: target.userId } }))
      .balance;
    const request = { amount: 500, reason: 'Bồi thường sự cố', requestId: randomUUID() };
    const url = `${API}/admin/users/${target.userId}/adjustments`;
    const a = await admin.http.post(url).send(request).expect(201);
    const b = await admin.http.post(url).send(request).expect(201);
    expect(a.body).toEqual(b.body);
    expect((a.body as { balance: number }).balance).toBe(before + 500);

    const tooMuch = await admin.http
      .post(url)
      .send({ amount: -(before + 501), reason: 'Quá số dư', requestId: randomUUID() })
      .expect(409);
    expect(errorCode(tooMuch.body)).toBe('INSUFFICIENT_COINS');

    const audits = await ctx.prisma.adminAuditLog.findMany({
      where: { action: 'COINS_ADJUSTED', targetId: target.userId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorId: admin.userId, reason: 'Bồi thường sự cố' });
    const notices = notificationPageSchema.parse(
      (await target.http.get(`${API}/notifications`)).body,
    );
    expect(notices.items.some((n) => n.type === 'ADMIN_NOTICE' && n.link === '/wallet')).toBe(true);
  });

  it('sends notices and revokes sessions', async () => {
    const [target] = await players(1);
    await admin.http
      .post(`${API}/admin/users/${target!.userId}/notices`)
      .send({ title: 'Bảo trì', body: 'Máy chủ bảo trì lúc 23:00.' })
      .expect(204);
    const page = notificationPageSchema.parse(
      (await target!.http.get(`${API}/notifications`)).body,
    );
    expect(page.items.some((n) => n.type === 'ADMIN_NOTICE' && n.title === 'Bảo trì')).toBe(true);

    await admin.http
      .post(`${API}/admin/users/${target!.userId}/sessions/revoke`)
      .send({ reason: 'Tài khoản bị lộ' })
      .expect(200);
    await target!.http.get(`${API}/users/me`).expect(401);
  });

  it('inspects, flags and aborts matches, refunding the fees', async () => {
    const detail = adminMatchDetailSchema.parse(
      (await admin.http.get(`${API}/admin/matches/${matchId}`).expect(200)).body,
    );
    expect(detail.events[0]!.type).toBe('DEALT');
    const flagged = adminMatchDetailSchema.parse(
      (
        await admin.http
          .post(`${API}/admin/matches/${matchId}/flag`)
          .send({ flagged: true, reason: 'Có báo cáo gian lận' })
          .expect(200)
      ).body,
    );
    expect(flagged.flaggedForReview).toBe(true);
    const list = adminMatchPageSchema.parse(
      (await admin.http.get(`${API}/admin/matches?flagged=true`)).body,
    );
    expect(list.items.map((m) => m.id)).toContain(matchId);
    const finished = await admin.http
      .post(`${API}/admin/matches/${matchId}/abort`)
      .send({ reason: 'Thử hủy' })
      .expect(409);
    expect(errorCode(finished.body)).toBe('MATCH_FINISHED');

    // A running paid match: aborting refunds everyone and shows in their history.
    const running = await players(4);
    const roomId = await readyRoom(running, FEE);
    await running[0]!.http.post(`${API}/rooms/${roomId}/start`).expect(200);
    const live = await ctx.prisma.match.findFirstOrThrow({ where: { roomId } });
    const aborted = adminMatchDetailSchema.parse(
      (
        await admin.http
          .post(`${API}/admin/matches/${live.id}/abort`)
          .send({ reason: 'Lỗi máy chủ' })
          .expect(200)
      ).body,
    );
    expect(aborted).toMatchObject({ status: 'ABORTED', abortReason: 'Lỗi máy chủ' });
    for (const p of running) {
      const wallet = await ctx.prisma.wallet.findUniqueOrThrow({ where: { userId: p.userId } });
      expect(wallet.balance).toBe(10_000);
    }
    const history = matchHistoryDetailSchema.parse(
      (await running[1]!.http.get(`${API}/history/${live.id}`).expect(200)).body,
    );
    expect(history.status).toBe('ABORTED');
    expect(history.players.every((p) => p.placement === null && p.coinDelta === null)).toBe(true);
    expect(history.timeline.at(-1)!.type).toBe('MATCH_ABORTED');
    expect(JSON.stringify(history)).not.toContain('Lỗi máy chủ');
  });

  it('reviews reports once', async () => {
    const reports = adminReportSchema
      .array()
      .parse((await admin.http.get(`${API}/admin/reports?status=OPEN`).expect(200)).body);
    const report = reports.find((r) => r.matchId === matchId)!;
    expect(report.reason).toBe('CHEATING');
    const url = `${API}/admin/reports/${report.id}/resolve`;
    await admin.http.post(url).send({ status: 'RESOLVED', reason: 'Đã cảnh cáo' }).expect(204);
    const again = await admin.http
      .post(url)
      .send({ status: 'DISMISSED', reason: 'Lần hai' })
      .expect(409);
    expect(errorCode(again.body)).toBe('ACTION_ALREADY_PROCESSED');
  });

  it('adds rule preset versions without editing old ones', async () => {
    const invalid = await admin.http
      .post(`${API}/admin/rule-presets`)
      .send({
        name: 'Sai luật',
        rules: { ...DEFAULT_GAME_RULES, suitOrder: ['S', 'S', 'D', 'H'] },
        allowedEntryFees: [0],
        allowedTurnTimers: [30],
        activate: true,
        reason: 'Thử nghiệm',
      })
      .expect(400);
    expect(errorCode(invalid.body)).toBe('VALIDATION_ERROR');

    const created = adminRulePresetSchema.parse(
      (
        await admin.http
          .post(`${API}/admin/rule-presets`)
          .send({
            name: 'Mặc định mới',
            rules: DEFAULT_GAME_RULES,
            allowedEntryFees: [500, 0, FEE],
            allowedTurnTimers: [45, 15, 30],
            activate: true,
            reason: 'Sắp xếp lại mức cược',
          })
          .expect(201)
      ).body,
    );
    expect(created).toMatchObject({ isActive: true, allowedEntryFees: [0, FEE, 500] });
    const presets = adminRulePresetSchema
      .array()
      .parse((await admin.http.get(`${API}/admin/rule-presets`)).body);
    expect(presets.filter((p) => p.isActive).map((p) => p.id)).toEqual([created.id]);
    const options = roomOptionsSchema.parse(
      (await table[0]!.http.get(`${API}/rooms/options`)).body,
    );
    expect(options.entryFees).toEqual([0, FEE, 500]);
  });

  it('records every action in the audit log', async () => {
    const page = adminAuditPageSchema.parse(
      (await admin.http.get(`${API}/admin/audit-logs?limit=50`).expect(200)).body,
    );
    const actions = new Set(page.items.map((e) => e.action));
    for (const action of [
      'COINS_ADJUSTED',
      'NOTICE_SENT',
      'USER_SESSIONS_REVOKED',
      'MATCH_FLAGGED',
      'MATCH_ABORTED',
      'REPORT_RESOLVED',
      'RULE_PRESET_CREATED',
    ]) {
      expect(actions.has(action)).toBe(true);
    }
    expect(page.items.every((e) => e.actor?.id === admin.userId)).toBe(true);
  });
});
