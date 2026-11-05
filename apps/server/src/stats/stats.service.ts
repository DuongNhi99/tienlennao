import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AchievementItem,
  averageOneDecimal,
  computeStreaks,
  type PlayerStatistics,
  type ProfileVisibility,
  type PublicPlayer,
  type PublicProfile,
  weekStart,
  winRatePercent,
} from '@tienlen/shared';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const RECENT_ROUNDS = 20;
const WEEKS = 12;
const WEEK_MS = 7 * 86_400_000;
const SEARCH_LIMIT = 10;

/**
 * Player statistics, profiles and achievements (contracts: `contracts/stats.ts`). Every figure
 * is derived from settled rounds (`match_players` of FINISHED matches), never from client data
 * or separately maintained counters, so the numbers always agree with the history.
 */
@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async statistics(userId: string, now = new Date()): Promise<PlayerStatistics> {
    const rounds = await this.prisma.matchPlayer.findMany({
      where: { userId, match: { status: 'FINISHED' }, placement: { not: null } },
      orderBy: [{ match: { finishedAt: 'asc' } }, { matchId: 'asc' }],
      select: {
        matchId: true,
        placement: true,
        roundScore: true,
        penaltyPoints: true,
        cardsPlayed: true,
        chopsMade: true,
        twosChopped: true,
        chopsReceived: true,
        twosLeft: true,
        match: { select: { finishedAt: true, _count: { select: { players: true } } } },
      },
    });
    const sum = (pick: (row: (typeof rounds)[number]) => number | null) =>
      rounds.reduce((total, row) => total + (pick(row) ?? 0), 0);
    const placements = rounds.map((row) => row.placement!);
    const won = placements.filter((place) => place === 1).length;

    const [seriesPlayed, seriesWon] = await Promise.all([
      this.prisma.gameSeries.count({
        where: { status: 'FINISHED', matches: { some: { players: { some: { userId } } } } },
      }),
      this.prisma.gameSeries.count({ where: { status: 'FINISHED', winnerId: userId } }),
    ]);

    const firstWeek = weekStart(new Date(now.getTime() - (WEEKS - 1) * WEEK_MS)).getTime();
    const weekly = Array.from({ length: WEEKS }, (_, i) => ({
      weekStart: new Date(firstWeek + i * WEEK_MS).toISOString(),
      played: 0,
      won: 0,
      score: 0,
      penaltyPoints: 0,
    }));
    for (const row of rounds) {
      const at = row.match.finishedAt?.getTime() ?? 0;
      const index = Math.floor((at - firstWeek) / WEEK_MS);
      const bucket = weekly[index];
      if (index < 0 || !bucket) continue;
      bucket.played += 1;
      bucket.won += row.placement === 1 ? 1 : 0;
      bucket.score += row.roundScore ?? 0;
      bucket.penaltyPoints += row.penaltyPoints ?? 0;
    }

    return {
      roundsPlayed: rounds.length,
      roundsWon: won,
      winRate: winRatePercent(rounds.length, won),
      averagePlace: rounds.length
        ? averageOneDecimal(
            sum((r) => r.placement),
            rounds.length,
          )
        : null,
      placements: [1, 2, 3, 4].map((place) => ({
        place,
        count: placements.filter((p) => p === place).length,
      })),
      lastPlaces: rounds.filter((row) => row.placement === row.match._count.players).length,
      cardsPlayed: sum((r) => r.cardsPlayed),
      chopsMade: sum((r) => r.chopsMade),
      twosChopped: sum((r) => r.twosChopped),
      chopsReceived: sum((r) => r.chopsReceived),
      twosLeft: sum((r) => r.twosLeft),
      penaltyPoints: sum((r) => r.penaltyPoints),
      totalScore: sum((r) => r.roundScore),
      streaks: computeStreaks(placements),
      series: { played: seriesPlayed, won: seriesWon },
      recent: rounds
        .slice(-RECENT_ROUNDS)
        .reverse()
        .map((row) => ({
          matchId: row.matchId,
          finishedAt: (row.match.finishedAt ?? now).toISOString(),
          placement: row.placement!,
          players: row.match._count.players,
          roundScore: row.roundScore,
          penaltyPoints: row.penaltyPoints,
        })),
      weekly,
    };
  }

  /** Every active achievement, with when the user unlocked it (null while locked). */
  async achievements(userId: string): Promise<AchievementItem[]> {
    const [all, unlocked] = await Promise.all([
      this.prisma.achievement.findMany({
        where: { isActive: true },
        orderBy: { rewardAmount: 'asc' },
      }),
      this.prisma.userAchievement.findMany({ where: { userId } }),
    ]);
    const at = new Map(unlocked.map((u) => [u.achievementId, u.unlockedAt]));
    return all.map((a) => ({
      code: a.code,
      name: a.name,
      description: a.description,
      rewardAmount: a.rewardAmount,
      unlockedAt: at.get(a.id)?.toISOString() ?? null,
    }));
  }

  /**
   * A player's profile. Statistics and achievements are shown to others only when the profile is
   * PUBLIC; the owner always sees them. Suspended or deleted accounts are not found.
   */
  async profile(viewerId: string, userId: string): Promise<PublicProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        profile: { select: { displayName: true, avatarUrl: true, profileVisibility: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE' || !user.profile) {
      throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    const isMe = viewerId === userId;
    const visible = isMe || user.profile.profileVisibility === 'PUBLIC';
    return {
      userId: user.id,
      displayName: user.profile.displayName,
      avatarUrl: this.users.publicAvatarUrl(user.profile.avatarUrl),
      createdAt: user.createdAt.toISOString(),
      visibility: user.profile.profileVisibility,
      isMe,
      statistics: visible ? await this.statistics(userId) : null,
      achievements: visible ? await this.achievements(userId) : null,
    };
  }

  async setVisibility(userId: string, visibility: ProfileVisibility): Promise<PublicProfile> {
    await this.prisma.userProfile.update({
      where: { userId },
      data: { profileVisibility: visibility },
    });
    return this.profile(userId, userId);
  }

  /** Active players whose display name contains `query` (case-insensitive), for invitations. */
  async search(viewerId: string, query: string): Promise<PublicPlayer[]> {
    const rows = await this.prisma.userProfile.findMany({
      where: {
        displayName: { contains: query, mode: 'insensitive' },
        userId: { not: viewerId },
        user: { status: 'ACTIVE' },
      },
      orderBy: { displayName: 'asc' },
      take: SEARCH_LIMIT,
      select: { userId: true, displayName: true, avatarUrl: true },
    });
    return rows.map((row) => ({
      userId: row.userId,
      displayName: row.displayName,
      avatarUrl: this.users.publicAvatarUrl(row.avatarUrl),
    }));
  }
}
