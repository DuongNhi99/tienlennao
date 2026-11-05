import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  dailyRewardAmount,
  type DailyRewardClaim,
  type DailyRewardStatus,
  nextRewardDayStart,
  nextStreakDay,
  rewardDayKey,
} from '@tienlen/shared';
import { AppException } from '../common/errors/app.exception';
import { isUniqueViolation } from '../common/prisma/prisma-helpers';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';

/** What achievement conditions are judged on: settled rounds only, latest first. */
interface AchievementFacts {
  matchesPlayed: number;
  matchesWon: number;
  chopsMade: number;
  twosChopped: number;
  /** The player's latest rounds, newest first (at most WIN_STREAK). */
  latest: {
    placement: number;
    players: number;
    penaltyPoints: number;
    twosLeft: number;
    cardsRemaining: number;
  }[];
}

const WIN_STREAK = 5;

/**
 * Achievement conditions (docs/ECONOMY.md, "Achievements"); names and rewards come from the
 * `achievements` table. Each is judged from settled rounds after the round that just finished.
 */
const ACHIEVEMENT_RULES: readonly {
  code: string;
  reached: (facts: AchievementFacts) => boolean;
}[] = [
  { code: 'FIRST_MATCH', reached: (f) => f.matchesPlayed >= 1 },
  { code: 'FIRST_WIN', reached: (f) => f.matchesWon >= 1 },
  { code: 'TEN_MATCHES', reached: (f) => f.matchesPlayed >= 10 },
  {
    code: 'WIN_STREAK_5',
    reached: (f) =>
      f.latest.length >= WIN_STREAK &&
      f.latest.slice(0, WIN_STREAK).every((r) => r.placement === 1),
  },
  { code: 'PIG_HUNTER', reached: (f) => f.twosChopped >= 5 },
  { code: 'BOMB_MASTER', reached: (f) => f.chopsMade >= 10 },
  {
    // Won a round right after finishing last in the previous one (3–4 players).
    code: 'COMEBACK',
    reached: ({ latest: [now, before] }) =>
      !!now &&
      !!before &&
      now.placement === 1 &&
      before.players >= 3 &&
      before.placement === before.players,
  },
  {
    // Finished last in a round of 3–4 players without a single penalty point or 2 left.
    code: 'PENALTY_FREE',
    reached: (f) => {
      const r = f.latest[0];
      return (
        !!r &&
        r.players >= 3 &&
        r.placement === r.players &&
        r.cardsRemaining > 0 &&
        r.penaltyPoints === 0 &&
        r.twosLeft === 0
      );
    },
  },
];

/** Daily login reward and achievements. Amounts are server-side constants and table values. */
@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  async dailyStatus(userId: string, now = new Date()): Promise<DailyRewardStatus> {
    return this.computeDaily(this.prisma, userId, now);
  }

  /** One claim per Vietnam calendar day; concurrent or repeated claims credit once. */
  async claimDaily(userId: string, now = new Date()): Promise<DailyRewardClaim> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const status = await this.computeDaily(tx, userId, now);
        if (!status.claimable) {
          throw new AppException('ACTION_ALREADY_PROCESSED', HttpStatus.CONFLICT);
        }
        const periodKey = rewardDayKey(now);
        const claim = await tx.rewardClaim.create({
          data: {
            userId,
            rewardType: 'DAILY_LOGIN',
            periodKey,
            amount: status.amount,
            streakDay: status.streakDay,
          },
        });
        const entry = await this.ledger.post(tx, {
          userId,
          type: 'DAILY_REWARD',
          amount: status.amount,
          idempotencyKey: `daily:${periodKey}`,
          metadata: { streakDay: status.streakDay },
        });
        await tx.rewardClaim.update({
          where: { id: claim.id },
          data: { walletTransactionId: entry.id },
        });
        return { amount: status.amount, balance: entry.balanceAfter };
      });
    } catch (error) {
      // A concurrent claim for the same day committed first.
      if (isUniqueViolation(error)) {
        throw new AppException('ACTION_ALREADY_PROCESSED', HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  /**
   * Awards every achievement the player has now reached and does not hold yet, inside the
   * caller's (settlement) transaction. Returns the codes unlocked.
   */
  async unlockAchievements(tx: Prisma.TransactionClient, userId: string): Promise<string[]> {
    const facts = await this.achievementFacts(tx, userId);
    const reached = ACHIEVEMENT_RULES.filter((rule) => rule.reached(facts)).map((r) => r.code);
    if (!reached.length) return [];
    const achievements = await tx.achievement.findMany({
      where: { code: { in: reached }, isActive: true, users: { none: { userId } } },
    });
    for (const achievement of achievements) {
      await tx.userAchievement.create({ data: { userId, achievementId: achievement.id } });
      if (achievement.rewardAmount > 0) {
        await this.ledger.post(tx, {
          userId,
          type: 'ACHIEVEMENT_REWARD',
          amount: achievement.rewardAmount,
          idempotencyKey: `achievement:${achievement.code}`,
        });
      }
    }
    return achievements.map((a) => a.code);
  }

  private async achievementFacts(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<AchievementFacts> {
    const settled = { userId, match: { status: 'FINISHED' as const }, placement: { not: null } };
    const [profile, totals, latest] = await Promise.all([
      tx.userProfile.findUniqueOrThrow({
        where: { userId },
        select: { matchesPlayed: true, matchesWon: true },
      }),
      tx.matchPlayer.aggregate({ where: settled, _sum: { chopsMade: true, twosChopped: true } }),
      tx.matchPlayer.findMany({
        where: settled,
        orderBy: [{ match: { finishedAt: 'desc' } }, { matchId: 'desc' }],
        take: WIN_STREAK,
        select: {
          placement: true,
          penaltyPoints: true,
          twosLeft: true,
          cardsRemaining: true,
          match: { select: { _count: { select: { players: true } } } },
        },
      }),
    ]);
    return {
      ...profile,
      chopsMade: totals._sum.chopsMade ?? 0,
      twosChopped: totals._sum.twosChopped ?? 0,
      latest: latest.map((row) => ({
        placement: row.placement!,
        players: row.match._count.players,
        penaltyPoints: row.penaltyPoints ?? 0,
        twosLeft: row.twosLeft ?? 0,
        cardsRemaining: row.cardsRemaining ?? 0,
      })),
    };
  }

  private async computeDaily(
    db: Prisma.TransactionClient,
    userId: string,
    now: Date,
  ): Promise<DailyRewardStatus> {
    const today = rewardDayKey(now);
    const last = await db.rewardClaim.findFirst({
      where: { userId, rewardType: 'DAILY_LOGIN' },
      orderBy: { periodKey: 'desc' },
      select: { periodKey: true, streakDay: true },
    });
    const claimedToday = last?.periodKey === today;
    const streakDay = claimedToday
      ? (last.streakDay ?? 1)
      : nextStreakDay(today, last && { dayKey: last.periodKey, streakDay: last.streakDay ?? 1 });
    return {
      claimable: !claimedToday,
      streakDay,
      amount: dailyRewardAmount(streakDay),
      nextClaimAt: nextRewardDayStart(now).toISOString(),
    };
  }
}
