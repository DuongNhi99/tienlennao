import { randomUUID } from 'node:crypto';
import {
  apiErrorSchema,
  calculatePayouts,
  dailyRewardClaimSchema,
  dailyRewardStatusSchema,
  DEFAULT_GAME_RULES,
  matchResultSchema,
  walletSummarySchema,
  walletTransactionPageSchema,
} from '@tienlen/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppException } from '../../src/common/errors/app.exception';
import { Dealer } from '../../src/game/dealer';
import { GameService } from '../../src/game/game.service';
import { LedgerService } from '../../src/wallet/ledger.service';
import { RewardsService } from '../../src/wallet/rewards.service';
import { WalletService } from '../../src/wallet/wallet.service';
import { createTestApp, registerUser, type TestContext } from './helpers';
import { playToEnd, readyRoom, TestDealer } from './play-helpers';

const API = '/api/v1';
const FEE = 100;
const START = 10_000;
let ctx: TestContext;

type Player = Awaited<ReturnType<typeof registerUser>>;
const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

beforeAll(async () => {
  ctx = await createTestApp((builder) =>
    builder.overrideProvider(Dealer).useValue(new TestDealer()),
  );
  // The test database starts empty: store the default preset and the achievements.
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
  for (const [code, rewardAmount] of [
    ['FIRST_MATCH', 200],
    ['FIRST_WIN', 500],
    ['TEN_MATCHES', 1000],
  ] as const) {
    await ctx.prisma.achievement.upsert({
      where: { code },
      update: { rewardAmount, isActive: true },
      create: { code, name: code, description: code, rewardAmount },
    });
  }
});

afterAll(async () => {
  await ctx.app.close();
});

const players = (count: number): Promise<Player[]> =>
  Promise.all(Array.from({ length: count }, () => registerUser(ctx.server)));

const balanceOf = async (userId: string) =>
  (await ctx.prisma.wallet.findUniqueOrThrow({ where: { userId } })).balance;

async function expectReconciled(userIds: string[]) {
  const wallet = ctx.app.get(WalletService);
  for (const userId of userIds) expect((await wallet.reconcile(userId)).consistent).toBe(true);
}

/** An administrative debit, to leave a player short of coins. */
async function debit(userId: string, amount: number) {
  await ctx.prisma.$transaction((tx) =>
    ctx.app.get(LedgerService).post(tx, {
      userId,
      type: 'ADMIN_ADJUSTMENT',
      amount: -amount,
      idempotencyKey: `test-debit:${randomUUID()}`,
      reason: 'test',
    }),
  );
}

const paidRoom = (table: Player[], entryFee = FEE) => readyRoom(table, entryFee);

describe('ledger', () => {
  it('applies an idempotency key once', async () => {
    const [p] = await players(1);
    const ledger = ctx.app.get(LedgerService);
    const entry = {
      userId: p!.userId,
      type: 'ADMIN_ADJUSTMENT' as const,
      amount: 250,
      idempotencyKey: 'test-once',
      reason: 'test',
    };
    const first = await ctx.prisma.$transaction((tx) => ledger.post(tx, entry));
    const second = await ctx.prisma.$transaction((tx) => ledger.post(tx, entry));
    expect(second.id).toBe(first.id);
    expect(await balanceOf(p!.userId)).toBe(START + 250);
    await expectReconciled([p!.userId]);
  });

  it('never overspends under concurrent debits', async () => {
    const [p] = await players(1);
    const ledger = ctx.app.get(LedgerService);
    const results = await Promise.allSettled(
      Array.from({ length: 15 }, (_, i) =>
        ctx.prisma.$transaction((tx) =>
          ledger.post(tx, {
            userId: p!.userId,
            type: 'ADMIN_ADJUSTMENT',
            amount: -1000,
            idempotencyKey: `test-concurrent-${i}`,
            reason: 'test',
          }),
        ),
      ),
    );
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    expect(rejected).toHaveLength(5);
    for (const r of rejected) {
      expect((r.reason as AppException).code).toBe('INSUFFICIENT_COINS');
    }
    expect(await balanceOf(p!.userId)).toBe(0);
    await expectReconciled([p!.userId]);
  });
});

describe('wallet API', () => {
  it('returns the summary and pages through the history, newest first', async () => {
    const [p] = await players(1);
    for (let i = 0; i < 12; i++) {
      await ctx.prisma.$transaction((tx) =>
        ctx.app.get(LedgerService).post(tx, {
          userId: p!.userId,
          type: 'ADMIN_ADJUSTMENT',
          amount: i + 1,
          idempotencyKey: `test-page-${i}`,
          reason: 'test',
        }),
      );
    }
    const summary = walletSummarySchema.parse(
      (await p!.http.get(`${API}/wallet`).expect(200)).body,
    );
    expect(summary).toEqual({ balance: START + 78, totalEarned: START + 78, totalSpent: 0 });

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?limit=5&cursor=${cursor}` : '?limit=5';
      const page = walletTransactionPageSchema.parse(
        (await p!.http.get(`${API}/wallet/transactions${query}`).expect(200)).body,
      );
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(13);
    expect(new Set(seen).size).toBe(13);
    const first = walletTransactionPageSchema.parse(
      (await p!.http.get(`${API}/wallet/transactions?limit=1`)).body,
    ).items[0]!;
    expect(first).toMatchObject({ type: 'ADMIN_ADJUSTMENT', amount: 12, balanceAfter: START + 78 });
  });
});

describe('daily reward', () => {
  it('pays once per day, and a second claim is refused', async () => {
    const [p] = await players(1);
    const status = dailyRewardStatusSchema.parse(
      (await p!.http.get(`${API}/rewards/daily`).expect(200)).body,
    );
    expect(status).toMatchObject({ claimable: true, streakDay: 1, amount: 100 });
    const claim = dailyRewardClaimSchema.parse(
      (await p!.http.post(`${API}/rewards/daily/claim`).expect(200)).body,
    );
    expect(claim).toEqual({ amount: 100, balance: START + 100 });
    const again = await p!.http.post(`${API}/rewards/daily/claim`).expect(409);
    expect(errorCode(again.body)).toBe('ACTION_ALREADY_PROCESSED');
    const after = dailyRewardStatusSchema.parse((await p!.http.get(`${API}/rewards/daily`)).body);
    expect(after.claimable).toBe(false);
  });

  it('credits concurrent claims once', async () => {
    const [p] = await players(1);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => p!.http.post(`${API}/rewards/daily/claim`)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await balanceOf(p!.userId)).toBe(START + 100);
    await expectReconciled([p!.userId]);
  });

  it('grows the streak on consecutive Vietnam days and resets after a gap', async () => {
    const [p] = await players(1);
    const rewards = ctx.app.get(RewardsService);
    // 23:30 in Vietnam on day 1, then 00:30 on day 2: one hour apart, consecutive days.
    const day1 = new Date('2030-01-01T16:30:00Z');
    const day2 = new Date('2030-01-01T17:30:00Z');
    const day4 = new Date('2030-01-04T05:00:00Z');
    expect((await rewards.claimDaily(p!.userId, day1)).amount).toBe(100);
    expect((await rewards.claimDaily(p!.userId, day2)).amount).toBe(200);
    expect((await rewards.dailyStatus(p!.userId, day4)).streakDay).toBe(1);
    expect((await rewards.claimDaily(p!.userId, day4)).amount).toBe(100);
    await expectReconciled([p!.userId]);
  });
});

describe('paid matches', () => {
  it('requires the fee to join', async () => {
    const [host, poor] = await players(2);
    await debit(poor!.userId, START - FEE + 1);
    const res = await host!.http
      .post(`${API}/rooms`)
      .send({ visibility: 'PUBLIC', entryFee: FEE, turnTimerSeconds: 30, requestId: randomUUID() })
      .expect(201);
    const { roomId } = res.body as { roomId: string };
    const join = await poor!.http.post(`${API}/rooms/${roomId}/join`).send({}).expect(409);
    expect(errorCode(join.body)).toBe('INSUFFICIENT_COINS');
  });

  it('charges every fee at the start, or none if someone cannot pay', async () => {
    const table = await players(4);
    const roomId = await paidRoom(table);
    await debit(table[2]!.userId, START - FEE + 1);
    const start = await table[0]!.http.post(`${API}/rooms/${roomId}/start`).expect(409);
    expect(errorCode(start.body)).toBe('INSUFFICIENT_COINS');
    expect(await ctx.prisma.match.count({ where: { roomId } })).toBe(0);
    expect(
      await ctx.prisma.walletTransaction.count({
        where: { userId: { in: table.map((p) => p.userId) }, type: 'MATCH_ENTRY' },
      }),
    ).toBe(0);
    expect((await ctx.prisma.room.findUniqueOrThrow({ where: { id: roomId } })).status).toBe(
      'READY',
    );
  });

  it(
    'settles a finished match exactly once, paying out the whole pool',
    { timeout: 120_000 },
    async () => {
      const table = await players(4);
      const roomId = await paidRoom(table);
      await table[0]!.http.post(`${API}/rooms/${roomId}/start`).expect(200);
      for (const p of table) expect(await balanceOf(p.userId)).toBe(START - FEE);

      await playToEnd(table, roomId);
      const result = matchResultSchema.parse(
        (await table[0]!.http.get(`${API}/rooms/${roomId}/game/result`).expect(200)).body,
      );
      const payouts = calculatePayouts(FEE);
      for (const placement of result.placements) {
        expect(placement.coinDelta).toBe(payouts[placement.placement - 1]! - FEE);
        // Achievements: everyone finished a first match; the winner also won for the first time.
        const achievements = 200 + (placement.placement === 1 ? 500 : 0);
        expect(await balanceOf(placement.userId)).toBe(START + placement.coinDelta + achievements);
      }
      expect(result.placements.reduce((sum, p) => sum + p.coinDelta, 0)).toBe(0);

      const match = await ctx.prisma.match.findUniqueOrThrow({ where: { id: result.matchId } });
      expect(match.settledAt).not.toBeNull();
      const rewards = await ctx.prisma.walletTransaction.findMany({
        where: { matchId: result.matchId, type: 'MATCH_REWARD' },
      });
      expect(rewards).toHaveLength(payouts.filter((p) => p > 0).length);
      expect(rewards.reduce((sum, r) => sum + r.amount, 0)).toBe(FEE * 4);
      await expectReconciled(table.map((p) => p.userId));
    },
  );

  it('refunds every fee once when a match is aborted', async () => {
    const table = await players(4);
    const roomId = await paidRoom(table);
    await table[0]!.http.post(`${API}/rooms/${roomId}/start`).expect(200);
    const match = await ctx.prisma.match.findFirstOrThrow({ where: { roomId } });
    const game = ctx.app.get(GameService);

    await game.abort(match.id, 'test');
    await game.abort(match.id, 'test again');
    for (const p of table) expect(await balanceOf(p.userId)).toBe(START);
    expect(
      await ctx.prisma.walletTransaction.count({
        where: { matchId: match.id, type: 'MATCH_REFUND' },
      }),
    ).toBe(4);
    expect((await ctx.prisma.match.findUniqueOrThrow({ where: { id: match.id } })).status).toBe(
      'ABORTED',
    );
    expect((await ctx.prisma.room.findUniqueOrThrow({ where: { id: roomId } })).status).toBe(
      'CANCELLED',
    );
    expect(await ctx.prisma.roomPlayer.count({ where: { roomId } })).toBe(0);
    await expectReconciled(table.map((p) => p.userId));
  });
});
