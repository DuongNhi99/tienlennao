import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type CombinationType,
  type CreateReportRequest,
  type Leaderboard,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type MatchHistoryDetail,
  type MatchHistoryItem,
  type MatchHistoryPage,
  type RankedRow,
  rankLeaderboard,
  type TimelineEvent,
  TIMELINE_EVENT_TYPES,
  weekStart,
  WIN_RATE_MIN_MATCHES,
} from '@tienlen/shared';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const LEADERBOARD_CACHE_MS = 60_000;

const playerSelect = {
  id: true,
  profile: { select: { displayName: true, avatarUrl: true } },
} satisfies Prisma.UserSelect;

const historyInclude = {
  room: { select: { code: true, name: true } },
  players: { orderBy: { seatIndex: 'asc' }, include: { user: { select: playerSelect } } },
} satisfies Prisma.MatchInclude;
type HistoryMatch = Prisma.MatchGetPayload<{ include: typeof historyInclude }>;

const COMPLETED = ['FINISHED', 'ABORTED'] as const;
const PUBLIC_EVENTS: ReadonlySet<string> = new Set(TIMELINE_EVENT_TYPES);

interface EventPayload {
  seat?: number;
  winnerSeat?: number;
  place?: number;
  choppedSeat?: number | null;
  combination?: { type: CombinationType; cards: TimelineEvent['cards'] };
}

/**
 * Match history, leaderboards and player reports (README, "History, leaderboard and
 * notifications"). History shows only matches the caller played, only public information
 * (never the deal), and coin figures as settled in the ledger.
 */
@Injectable()
export class HistoryService {
  private readonly leaderboardCache = new Map<string, { at: number; rows: RankedRow[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /** Completed matches of `userId`, newest first. */
  async matches(
    userId: string,
    { cursor, limit }: { cursor?: string; limit: number },
  ): Promise<MatchHistoryPage> {
    const rows = await this.prisma.match.findMany({
      where: { status: { in: [...COMPLETED] }, players: { some: { userId } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: historyInclude,
    });
    const items = rows.slice(0, limit);
    return {
      items: items.map((match) => this.toItem(match, userId)),
      nextCursor: rows.length > limit ? items.at(-1)!.id : null,
    };
  }

  /** A completed match the caller played in; anything else is NOT_FOUND. */
  async match(userId: string, matchId: string): Promise<MatchHistoryDetail> {
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, status: { in: [...COMPLETED] }, players: { some: { userId } } },
      include: {
        ...historyInclude,
        events: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!match) throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
    return {
      ...this.toItem(match, userId),
      timeline: match.events
        .filter((event) => PUBLIC_EVENTS.has(event.type))
        .map((event) => {
          const payload = (event.payload ?? {}) as EventPayload;
          return {
            sequence: event.sequence,
            type: event.type as TimelineEvent['type'],
            at: event.createdAt.toISOString(),
            seatIndex: payload.seat ?? payload.winnerSeat ?? null,
            cards: payload.combination?.cards ?? null,
            combinationType: payload.combination?.type ?? null,
            choppedSeat: payload.choppedSeat ?? null,
            place: payload.place ?? null,
          };
        }),
    };
  }

  async leaderboard(
    metric: LeaderboardMetric,
    period: LeaderboardPeriod,
    { offset, limit }: { offset: number; limit: number },
    viewerId: string,
    now = new Date(),
  ): Promise<Leaderboard> {
    const since = period === 'week' ? weekStart(now) : null;
    const minMatches = metric === 'winRate' ? WIN_RATE_MIN_MATCHES[period] : 0;
    const rows = await this.rankedRows(metric, period, since, minMatches);
    const page = rows.slice(offset, offset + limit);
    const me = rows.find((row) => row.userId === viewerId) ?? null;
    const profiles = await this.prisma.userProfile.findMany({
      where: { userId: { in: [...page, ...(me ? [me] : [])].map((row) => row.userId) } },
      select: { userId: true, avatarUrl: true },
    });
    const avatar = new Map(profiles.map((p) => [p.userId, p.avatarUrl]));
    const toEntry = (row: RankedRow) => ({
      userId: row.userId,
      displayName: row.displayName,
      avatarUrl: this.users.publicAvatarUrl(avatar.get(row.userId) ?? null),
      rank: row.rank,
      wins: row.wins,
      matchesPlayed: row.played,
      winRate: row.winRate,
    });
    return {
      metric,
      period,
      since: since?.toISOString() ?? null,
      minMatches,
      entries: page.map(toEntry),
      total: rows.length,
      me: me ? toEntry(me) : null,
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Players report others from a match they both played. A second open report for the same
   * player and match is not duplicated.
   */
  async report(reporterId: string, request: CreateReportRequest): Promise<{ reportId: string }> {
    if (request.reportedUserId === reporterId) {
      throw new AppException('VALIDATION_ERROR', HttpStatus.BAD_REQUEST, [
        { path: 'reportedUserId', message: 'Bạn không thể báo cáo chính mình.' },
      ]);
    }
    const players = await this.prisma.matchPlayer.findMany({
      where: { matchId: request.matchId, userId: { in: [reporterId, request.reportedUserId] } },
      select: { userId: true },
    });
    if (players.length !== 2) throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
    const existing = await this.prisma.playerReport.findFirst({
      where: {
        reporterId,
        reportedUserId: request.reportedUserId,
        matchId: request.matchId,
        status: { in: ['OPEN', 'REVIEWING'] },
      },
      select: { id: true },
    });
    if (existing) return { reportId: existing.id };
    const report = await this.prisma.playerReport.create({
      data: {
        reporterId,
        reportedUserId: request.reportedUserId,
        matchId: request.matchId,
        reason: request.reason,
        details: request.details ?? null,
      },
    });
    return { reportId: report.id };
  }

  private toItem(match: HistoryMatch, userId: string): MatchHistoryItem {
    const aborted = match.status === 'ABORTED';
    const startedAt = match.startedAt ?? match.createdAt;
    return {
      matchId: match.id,
      roomId: match.roomId,
      roomCode: match.room.code,
      roomName: match.room.name,
      status: match.status as MatchHistoryItem['status'],
      entryFee: match.entryFee,
      startedAt: startedAt.toISOString(),
      finishedAt: match.finishedAt?.toISOString() ?? null,
      durationSeconds: match.finishedAt
        ? Math.round((match.finishedAt.getTime() - startedAt.getTime()) / 1000)
        : null,
      mySeat: match.players.find((p) => p.userId === userId)!.seatIndex,
      players: match.players.map((p) => ({
        userId: p.userId,
        displayName: p.user.profile?.displayName ?? '',
        avatarUrl: this.users.publicAvatarUrl(p.user.profile?.avatarUrl ?? null),
        seatIndex: p.seatIndex,
        placement: aborted ? null : p.placement,
        cardsRemaining: aborted ? null : p.cardsRemaining,
        coinDelta: aborted ? null : p.coinDelta,
      })),
    };
  }

  /**
   * Counts finished matches per active player (aborted matches and suspended or deleted
   * accounts never count), ranked. Cached for a minute per board: results are public, the
   * same for everyone, and only change when matches finish.
   */
  private async rankedRows(
    metric: LeaderboardMetric,
    period: LeaderboardPeriod,
    since: Date | null,
    minMatches: number,
  ): Promise<RankedRow[]> {
    const key = `${metric}:${period}:${since?.toISOString() ?? 'all'}`;
    const cached = this.leaderboardCache.get(key);
    if (cached && Date.now() - cached.at < LEADERBOARD_CACHE_MS) return cached.rows;

    const where: Prisma.MatchPlayerWhereInput = {
      match: { status: 'FINISHED', ...(since ? { finishedAt: { gte: since } } : {}) },
      user: { status: 'ACTIVE' },
    };
    const [played, wins] = await Promise.all([
      this.prisma.matchPlayer.groupBy({ by: ['userId'], where, _count: { _all: true } }),
      this.prisma.matchPlayer.groupBy({
        by: ['userId'],
        where: { ...where, placement: 1 },
        _count: { _all: true },
      }),
    ]);
    const winsBy = new Map(wins.map((w) => [w.userId, w._count._all]));
    const names = await this.prisma.userProfile.findMany({
      where: { userId: { in: played.map((p) => p.userId) } },
      select: { userId: true, displayName: true },
    });
    const nameBy = new Map(names.map((n) => [n.userId, n.displayName]));
    const rows = rankLeaderboard(
      played.map((p) => ({
        userId: p.userId,
        displayName: nameBy.get(p.userId) ?? '',
        played: p._count._all,
        wins: winsBy.get(p.userId) ?? 0,
      })),
      metric,
      minMatches,
    );
    this.leaderboardCache.set(key, { at: Date.now(), rows });
    return rows;
  }
}
