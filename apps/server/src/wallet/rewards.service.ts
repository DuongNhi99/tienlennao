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

/** Achievement conditions (docs/ECONOMY.md); rewards come from the `achievements` table. */
const ACHIEVEMENT_RULES: readonly {
  code: string;
  reached: (stats: { matchesPlayed: number; matchesWon: number }) => boolean;
}[] = [
  { code: 'FIRST_MATCH', reached: (s) => s.matchesPlayed >= 1 },
  { code: 'FIRST_WIN', reached: (s) => s.matchesWon >= 1 },
  { code: 'TEN_MATCHES', reached: (s) => s.matchesPlayed >= 10 },
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
    const stats = await tx.userProfile.findUniqueOrThrow({
      where: { userId },
      select: { matchesPlayed: true, matchesWon: true },
    });
    const reached = ACHIEVEMENT_RULES.filter((rule) => rule.reached(stats)).map((r) => r.code);
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
