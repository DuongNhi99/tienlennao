import { HttpStatus, Injectable } from '@nestjs/common';
import type { GameSeries, Prisma } from '@prisma/client';
import {
  type GameRules,
  gameRulesSchema,
  isSeriesOver,
  rankSeriesStandings,
  type SeriesDetail,
  type SeriesRoundResult,
  type SeriesSettings,
  type SeriesSummary,
  seriesWinner,
} from '@tienlen/shared';
import { AppException } from '../common/errors/app.exception';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

type Db = Prisma.TransactionClient;

const OPEN_ROOM_STATUSES = ['WAITING', 'READY'] as const;
const LIVE_ROOM_STATUSES = ['STARTING', 'IN_PROGRESS'] as const;

const resultSelect = {
  userId: true,
  placement: true,
  roundScore: true,
  penaltyPoints: true,
  match: { select: { roundNumber: true } },
  user: { select: { profile: { select: { displayName: true, avatarUrl: true } } } },
} satisfies Prisma.MatchPlayerSelect;

/**
 * Multi-round matches (docs/GAME_RULES.md §20). A series owns the rules of all its rounds (fixed
 * when round 1 starts) and the end condition; each round is an ordinary room and match. Standings
 * are always computed from the rounds' settled `match_players` rows, never stored separately, so
 * they cannot drift from the rounds.
 */
@Injectable()
export class SeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  /** Creates the series for a new room (round 1). */
  create(db: Db, hostId: string, settings: SeriesSettings): Promise<GameSeries> {
    return db.gameSeries.create({
      data: {
        hostId,
        endCondition: settings.endCondition,
        targetRounds: settings.targetRounds,
        targetScore: settings.targetScore,
      },
    });
  }

  /**
   * The rules a round of the series plays by. Round 1 fixes them from the room; every later
   * round uses that snapshot, so the rules never change within a series.
   */
  async rulesForRound(db: Db, seriesId: string, roomRules: GameRules): Promise<GameRules> {
    const series = await db.gameSeries.findUniqueOrThrow({ where: { id: seriesId } });
    if (series.ruleSnapshot !== null) return gameRulesSchema.parse(series.ruleSnapshot);
    await db.gameSeries.update({ where: { id: seriesId }, data: { ruleSnapshot: roomRules } });
    return roomRules;
  }

  /** Whether the series' rules are already fixed (its first round has started). */
  async rulesLocked(db: Db, seriesId: string): Promise<boolean> {
    const series = await db.gameSeries.findUnique({
      where: { id: seriesId },
      select: { ruleSnapshot: true },
    });
    return series !== null && series.ruleSnapshot !== null;
  }

  /**
   * After a round's settlement, in the same transaction: counts the round and finishes the series
   * when its end condition is met. Returns whether the series finished.
   */
  async roundFinished(db: Db, seriesId: string): Promise<boolean> {
    const series = await db.gameSeries.findUniqueOrThrow({ where: { id: seriesId } });
    if (series.status !== 'IN_PROGRESS') return false;
    const results = await this.results(db, seriesId);
    const standings = rankSeriesStandings(results);
    const roundsPlayed = new Set(results.map((r) => r.roundNumber)).size;
    const over = isSeriesOver(series, roundsPlayed, standings);
    await db.gameSeries.update({
      where: { id: seriesId },
      data: over
        ? {
            roundsPlayed,
            status: 'FINISHED',
            finishedAt: new Date(),
            winnerId: seriesWinner(standings, results),
          }
        : { roundsPlayed },
    });
    if (over) await this.detachOpenRooms(db, seriesId);
    return over;
  }

  /**
   * The host ends a manual (or any) series between rounds. Open rooms of a next round become
   * ordinary rooms. Ending an already finished series is a no-op.
   */
  async finish(seriesId: string, userId: string): Promise<SeriesDetail> {
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        unknown[]
      >`SELECT 1 FROM game_series WHERE id = ${seriesId}::uuid FOR UPDATE`;
      if (rows.length === 0) throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
      const series = await tx.gameSeries.findUniqueOrThrow({ where: { id: seriesId } });
      if (series.hostId !== userId) throw new AppException('FORBIDDEN', HttpStatus.FORBIDDEN);
      if (series.status !== 'IN_PROGRESS') return;
      const live = await tx.room.count({
        where: { seriesId, status: { in: [...LIVE_ROOM_STATUSES] } },
      });
      if (live > 0) throw new AppException('ROOM_ALREADY_STARTED', HttpStatus.CONFLICT);
      const results = await this.results(tx, seriesId);
      const standings = rankSeriesStandings(results);
      await tx.gameSeries.update({
        where: { id: seriesId },
        data: {
          status: 'FINISHED',
          finishedAt: new Date(),
          roundsPlayed: new Set(results.map((r) => r.roundNumber)).size,
          winnerId: seriesWinner(standings, results),
        },
      });
      await this.detachOpenRooms(tx, seriesId);
    });
    return this.detail(seriesId, userId);
  }

  /** Summary with standings, for room views and results. */
  async summary(seriesId: string, db: Db = this.prisma): Promise<SeriesSummary> {
    const series = await db.gameSeries.findUniqueOrThrow({ where: { id: seriesId } });
    const results = await this.results(db, seriesId);
    return this.toSummary(series, results, await this.avatars(db, results));
  }

  /** Every round and the standings. Only for players of the series and people at its tables. */
  async detail(seriesId: string, viewerId: string): Promise<SeriesDetail> {
    const series = await this.prisma.gameSeries.findUnique({
      where: { id: seriesId },
      include: {
        matches: {
          orderBy: { roundNumber: 'asc' },
          include: {
            players: { orderBy: { seatIndex: 'asc' }, include: { user: { select: playerSelect } } },
          },
        },
        rooms: {
          select: {
            id: true,
            status: true,
            players: { select: { userId: true } },
            spectators: { select: { userId: true } },
          },
        },
      },
    });
    if (!series) throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
    const allowed =
      series.hostId === viewerId ||
      series.matches.some((m) => m.players.some((p) => p.userId === viewerId)) ||
      series.rooms.some(
        (r) =>
          r.players.some((p) => p.userId === viewerId) ||
          r.spectators.some((s) => s.userId === viewerId),
      );
    if (!allowed) throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);

    const results = await this.results(this.prisma, seriesId);
    const rules = gameRulesSchema.safeParse(series.ruleSnapshot);
    const nextRoom = series.rooms.find((r) =>
      (OPEN_ROOM_STATUSES as readonly string[]).includes(r.status),
    );
    return {
      ...this.toSummary(series, results, await this.avatars(this.prisma, results)),
      rules: rules.success ? rules.data : null,
      createdAt: series.createdAt.toISOString(),
      finishedAt: series.finishedAt?.toISOString() ?? null,
      nextRoomId: series.status === 'IN_PROGRESS' ? (nextRoom?.id ?? null) : null,
      rounds: series.matches
        .filter((m) => m.status === 'PLAYING' || m.status === 'FINISHED' || m.status === 'ABORTED')
        .map((m) => ({
          roundNumber: m.roundNumber!,
          matchId: m.id,
          roomId: m.roomId,
          status: m.status as 'PLAYING' | 'FINISHED' | 'ABORTED',
          finishedAt: m.finishedAt?.toISOString() ?? null,
          results: m.players.map((p) => ({
            userId: p.userId,
            displayName: p.user.profile?.displayName ?? '',
            avatarUrl: this.users.publicAvatarUrl(p.user.profile?.avatarUrl ?? null),
            placement: m.status === 'FINISHED' ? p.placement : null,
            roundScore: m.status === 'FINISHED' ? p.roundScore : null,
            penaltyPoints: m.status === 'FINISHED' ? p.penaltyPoints : null,
          })),
        })),
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /** The settled results of every finished round. */
  private async results(db: Db, seriesId: string): Promise<SeriesRoundResult[]> {
    const rows = await db.matchPlayer.findMany({
      where: { match: { seriesId, status: 'FINISHED' }, placement: { not: null } },
      select: resultSelect,
    });
    return rows.map((row) => ({
      userId: row.userId,
      displayName: row.user.profile?.displayName ?? '',
      roundNumber: row.match.roundNumber ?? 0,
      placement: row.placement!,
      roundScore: row.roundScore ?? 0,
      penaltyPoints: row.penaltyPoints ?? 0,
    }));
  }

  private async avatars(db: Db, results: readonly SeriesRoundResult[]) {
    const profiles = await db.userProfile.findMany({
      where: { userId: { in: [...new Set(results.map((r) => r.userId))] } },
      select: { userId: true, avatarUrl: true },
    });
    return new Map(profiles.map((p) => [p.userId, this.users.publicAvatarUrl(p.avatarUrl)]));
  }

  private toSummary(
    series: GameSeries,
    results: readonly SeriesRoundResult[],
    avatars: ReadonlyMap<string, string | null>,
  ): SeriesSummary {
    return {
      id: series.id,
      hostId: series.hostId,
      status: series.status,
      endCondition: series.endCondition,
      targetRounds: series.targetRounds,
      targetScore: series.targetScore,
      roundsPlayed: new Set(results.map((r) => r.roundNumber)).size,
      winnerId: series.winnerId,
      standings: rankSeriesStandings(results).map((row) => ({
        userId: row.userId,
        displayName: row.displayName,
        avatarUrl: avatars.get(row.userId) ?? null,
        rank: row.rank,
        totalScore: row.totalScore,
        roundsPlayed: row.roundsPlayed,
        roundsWon: row.roundsWon,
        penaltyPoints: row.penaltyPoints,
      })),
    };
  }

  /** Next-round rooms that have not started leave a finished series and play single rounds. */
  private async detachOpenRooms(db: Db, seriesId: string): Promise<void> {
    await db.room.updateMany({
      where: { seriesId, status: { in: [...OPEN_ROOM_STATUSES] } },
      data: { seriesId: null, roundNumber: null },
    });
  }
}

const playerSelect = {
  id: true,
  profile: { select: { displayName: true, avatarUrl: true } },
} satisfies Prisma.UserSelect;
