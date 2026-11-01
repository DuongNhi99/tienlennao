import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type AdminAuditPage,
  type AdminCoinAdjustmentRequest,
  type AdminCreateRulePresetRequest,
  type AdminMatch,
  type AdminMatchDetail,
  type AdminMatchPage,
  type AdminOverview,
  type AdminReport,
  type AdminRulePreset,
  type AdminUser,
  type AdminUserStatusResponse,
  gameRulesSchema,
  type UpdateUserStatusRequest,
} from '@tienlen/shared';
import { z } from 'zod';
import { AppException } from '../common/errors/app.exception';
import { GameService } from '../game/game.service';
import { HealthService } from '../health/health.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { LedgerService } from '../wallet/ledger.service';

const DAY_MS = 86_400_000;
const PRESET_KEY = 'default';

/** Who did it and from where, recorded with every administrative change. */
export interface AdminActor {
  id: string;
  ipAddress: string | null;
}

const userInclude = {
  profile: { select: { displayName: true, matchesPlayed: true, matchesWon: true } },
  wallet: { select: { balance: true } },
  _count: { select: { sessions: { where: { revokedAt: null } } } },
} satisfies Prisma.UserInclude;

const matchInclude = {
  room: { select: { code: true } },
  players: {
    orderBy: { seatIndex: 'asc' },
    include: { user: { select: { profile: { select: { displayName: true } } } } },
  },
  _count: {
    select: {
      events: { where: { type: 'TURN_TIMEOUT' } },
      reports: { where: { status: { in: ['OPEN', 'REVIEWING'] } } },
    },
  },
} satisfies Prisma.MatchInclude;

const notFound = () => new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);

/**
 * The admin area (README, "Admin"). Every change is validated here, on the server, and written
 * to `admin_audit_logs` in the same transaction as the change itself. Ledger rows and finished
 * match results are never edited or deleted: coins are corrected with new ledger rows and
 * running matches are aborted with refunds.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly game: GameService,
    private readonly health: HealthService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  // ─── Overview ─────────────────────────────────────────────────────────────

  async overview(now = new Date()): Promise<AdminOverview> {
    const day = new Date(now.getTime() - DAY_MS);
    const week = new Date(now.getTime() - 7 * DAY_MS);
    const [
      total,
      active,
      suspended,
      newUsers,
      openRooms,
      playing,
      finished24h,
      finished7d,
      aborted7d,
      coins,
      timeouts,
      flagged,
      openReports,
      readiness,
    ] = await Promise.all([
      this.prisma.user.count({ where: { status: { not: 'DELETED' } } }),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.user.count({ where: { createdAt: { gte: week } } }),
      this.prisma.room.count({
        where: { status: { in: ['WAITING', 'READY', 'STARTING', 'IN_PROGRESS'] } },
      }),
      this.prisma.match.count({ where: { status: 'PLAYING' } }),
      this.prisma.match.count({ where: { status: 'FINISHED', finishedAt: { gte: day } } }),
      this.prisma.match.count({ where: { status: 'FINISHED', finishedAt: { gte: week } } }),
      this.prisma.match.count({ where: { status: 'ABORTED', finishedAt: { gte: week } } }),
      this.prisma.wallet.aggregate({ _sum: { balance: true } }),
      this.prisma.matchEvent.count({ where: { type: 'TURN_TIMEOUT', createdAt: { gte: day } } }),
      this.prisma.match.count({ where: { flaggedForReview: true } }),
      this.prisma.playerReport.count({ where: { status: { in: ['OPEN', 'REVIEWING'] } } }),
      this.health.readiness(),
    ]);
    return {
      users: { total, active, suspended, newLast7Days: newUsers },
      rooms: { open: openRooms },
      matches: {
        playing,
        finishedLast24h: finished24h,
        finishedLast7Days: finished7d,
        abortedLast7Days: aborted7d,
      },
      coinsInCirculation: coins._sum.balance ?? 0,
      incidents: { timeoutsLast24h: timeouts, flaggedMatches: flagged, openReports },
      health: {
        database: readiness.checks.database.status,
        redis: readiness.checks.redis.status,
      },
      generatedAt: now.toISOString(),
    };
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  /** By exact user ID, or by part of a display name or email; newest accounts first. */
  async searchUsers(q: string, limit: number): Promise<AdminUser[]> {
    const where: Prisma.UserWhereInput = !q
      ? {}
      : z.uuid().safeParse(q).success
        ? { id: q }
        : {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { profile: { displayName: { contains: q, mode: 'insensitive' } } },
            ],
          };
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: userInclude,
    });
    return users.map((user) => this.toAdminUser(user));
  }

  async user(userId: string): Promise<AdminUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: userInclude });
    if (!user) throw notFound();
    return this.toAdminUser(user);
  }

  /** Suspension revokes every session immediately. Admins cannot change their own status. */
  async updateUserStatus(
    actor: AdminActor,
    userId: string,
    body: UpdateUserStatusRequest,
  ): Promise<AdminUserStatusResponse> {
    if (userId === actor.id) throw new AppException('FORBIDDEN', HttpStatus.FORBIDDEN);
    return this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!target || target.status === 'DELETED') throw notFound();
      const suspend = body.status === 'SUSPENDED';
      await tx.user.update({
        where: { id: userId },
        data: {
          status: body.status,
          suspendedAt: suspend ? new Date() : null,
          suspensionReason: suspend ? body.reason : null,
        },
      });
      const { count } = suspend
        ? await tx.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          })
        : { count: 0 };
      await this.audit(tx, actor, suspend ? 'USER_SUSPENDED' : 'USER_REACTIVATED', 'USER', userId, {
        reason: body.reason,
        metadata: { previousStatus: target.status, revokedSessions: count },
      });
      return { userId, status: body.status, revokedSessions: count };
    });
  }

  async revokeSessions(
    actor: AdminActor,
    userId: string,
    reason: string,
  ): Promise<{ revokedSessions: number }> {
    await this.user(userId);
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit(tx, actor, 'USER_SESSIONS_REVOKED', 'USER', userId, {
        reason,
        metadata: { revokedSessions: count },
      });
      return { revokedSessions: count };
    });
  }

  /**
   * A correction is a new ADMIN_ADJUSTMENT ledger row with the reason and the acting admin;
   * nothing is edited. Retrying with the same request ID applies it once.
   */
  async adjustCoins(
    actor: AdminActor,
    userId: string,
    request: AdminCoinAdjustmentRequest,
  ): Promise<{ transactionId: string; balance: number }> {
    await this.user(userId);
    const idempotencyKey = `admin:${request.requestId}`;
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.walletTransaction.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
      });
      if (existing) return { entry: existing, created: false };
      const entry = await this.ledger.post(tx, {
        userId,
        type: 'ADMIN_ADJUSTMENT',
        amount: request.amount,
        idempotencyKey,
        actorId: actor.id,
        reason: request.reason,
      });
      await this.audit(tx, actor, 'COINS_ADJUSTED', 'USER', userId, {
        reason: request.reason,
        metadata: { amount: request.amount, transactionId: entry.id },
      });
      await this.notifications.create(tx, [
        {
          userId,
          type: 'ADMIN_NOTICE',
          title: 'Số xu đã được điều chỉnh',
          body: `${request.amount > 0 ? '+' : ''}${request.amount} xu. Lý do: ${request.reason}`,
          link: '/wallet',
          dedupeKey: idempotencyKey,
        },
      ]);
      return { entry, created: true };
    });
    if (result.created) {
      this.realtime.userUpdated([userId]);
      this.notifications.announce([userId]);
    }
    return { transactionId: result.entry.id, balance: result.entry.balanceAfter };
  }

  async sendNotice(
    actor: AdminActor,
    userId: string,
    notice: { title: string; body: string },
  ): Promise<void> {
    await this.user(userId);
    const created = await this.prisma.$transaction(async (tx) => {
      const log = await this.audit(tx, actor, 'NOTICE_SENT', 'USER', userId, {
        metadata: { title: notice.title },
      });
      return this.notifications.create(tx, [
        { userId, type: 'ADMIN_NOTICE', ...notice, dedupeKey: `notice:${log.id}` },
      ]);
    });
    this.notifications.announce(created);
  }

  // ─── Matches ──────────────────────────────────────────────────────────────

  async matches(query: {
    status?: 'PLAYING' | 'FINISHED' | 'ABORTED';
    flagged?: boolean;
    userId?: string;
    cursor?: string;
    limit: number;
  }): Promise<AdminMatchPage> {
    const rows = await this.prisma.match.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.flagged === undefined ? {} : { flaggedForReview: query.flagged }),
        ...(query.userId ? { players: { some: { userId: query.userId } } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: matchInclude,
    });
    const items = rows.slice(0, query.limit);
    return {
      items: items.map((match) => this.toAdminMatch(match)),
      nextCursor: rows.length > query.limit ? items.at(-1)!.id : null,
    };
  }

  /** Includes the deal (DEALT): administrators need it to investigate disputes. */
  async match(matchId: string): Promise<AdminMatchDetail> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: { ...matchInclude, events: { orderBy: { sequence: 'asc' } } },
    });
    if (!match) throw notFound();
    return {
      ...this.toAdminMatch(match),
      events: match.events.map((event) => ({
        sequence: event.sequence,
        type: event.type,
        actorUserId: event.actorUserId,
        actionId: event.actionId,
        payload: event.payload,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  async flagMatch(
    actor: AdminActor,
    matchId: string,
    flagged: boolean,
    reason: string,
  ): Promise<AdminMatchDetail> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.match.updateMany({
        where: { id: matchId },
        data: { flaggedForReview: flagged },
      });
      if (count === 0) throw notFound();
      await this.audit(tx, actor, flagged ? 'MATCH_FLAGGED' : 'MATCH_UNFLAGGED', 'MATCH', matchId, {
        reason,
      });
    });
    return this.match(matchId);
  }

  /** Aborts a running match with full refunds (docs/ECONOMY.md); finished matches cannot be. */
  async abortMatch(actor: AdminActor, matchId: string, reason: string): Promise<AdminMatchDetail> {
    const before = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: { status: true },
    });
    if (!before) throw notFound();
    await this.game.abort(matchId, reason);
    if (before.status !== 'ABORTED') {
      await this.prisma.$transaction((tx) =>
        this.audit(tx, actor, 'MATCH_ABORTED', 'MATCH', matchId, {
          reason,
          metadata: { previousStatus: before.status },
        }),
      );
    }
    return this.match(matchId);
  }

  // ─── Reports ──────────────────────────────────────────────────────────────

  async reports(status?: AdminReport['status']): Promise<AdminReport[]> {
    const reports = await this.prisma.playerReport.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        reporter: { select: { id: true, profile: { select: { displayName: true } } } },
        reportedUser: { select: { id: true, profile: { select: { displayName: true } } } },
      },
    });
    return reports.map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      matchId: r.matchId,
      reporter: { id: r.reporter.id, displayName: r.reporter.profile?.displayName ?? '' },
      reported: { id: r.reportedUser.id, displayName: r.reportedUser.profile?.displayName ?? '' },
      resolutionNote: r.resolutionNote,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
    }));
  }

  async resolveReport(
    actor: AdminActor,
    reportId: string,
    status: 'RESOLVED' | 'DISMISSED',
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const report = await tx.playerReport.findUnique({ where: { id: reportId } });
      if (!report) throw notFound();
      if (report.status === 'RESOLVED' || report.status === 'DISMISSED') {
        throw new AppException('ACTION_ALREADY_PROCESSED', HttpStatus.CONFLICT);
      }
      await tx.playerReport.update({
        where: { id: reportId },
        data: { status, resolutionNote: reason, resolvedById: actor.id, resolvedAt: new Date() },
      });
      await this.audit(tx, actor, `REPORT_${status}`, 'REPORT', reportId, { reason });
    });
  }

  // ─── Rule presets ─────────────────────────────────────────────────────────

  async rulePresets(): Promise<AdminRulePreset[]> {
    const presets = await this.prisma.gameRuleConfiguration.findMany({
      where: { key: PRESET_KEY },
      orderBy: { version: 'desc' },
      include: { createdBy: { select: { profile: { select: { displayName: true } } } } },
    });
    return presets.map((p) => ({
      id: p.id,
      key: p.key,
      version: p.version,
      name: p.name,
      isActive: p.isActive,
      rules: p.rules,
      allowedEntryFees: p.allowedEntryFees,
      allowedTurnTimers: p.allowedTurnTimers,
      createdAt: p.createdAt.toISOString(),
      createdBy: p.createdBy?.profile?.displayName ?? null,
    }));
  }

  /**
   * Adds a new preset version; existing versions are never edited, because rooms reference
   * them and matches keep a snapshot. Activating it deactivates the others; rooms created
   * earlier keep their preset.
   */
  async createRulePreset(
    actor: AdminActor,
    request: AdminCreateRulePresetRequest,
  ): Promise<AdminRulePreset> {
    const rules = gameRulesSchema.safeParse(request.rules);
    if (!rules.success) {
      throw new AppException(
        'VALIDATION_ERROR',
        HttpStatus.BAD_REQUEST,
        rules.error.issues.map((issue) => ({
          path: ['rules', ...issue.path.map(String)].join('.'),
          message: issue.message,
        })),
      );
    }
    const preset = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.gameRuleConfiguration.aggregate({
        where: { key: PRESET_KEY },
        _max: { version: true },
      });
      if (request.activate) {
        await tx.gameRuleConfiguration.updateMany({
          where: { key: PRESET_KEY, isActive: true },
          data: { isActive: false },
        });
      }
      const created = await tx.gameRuleConfiguration.create({
        data: {
          key: PRESET_KEY,
          version: (latest._max.version ?? 0) + 1,
          name: request.name,
          isActive: request.activate,
          rules: rules.data,
          allowedEntryFees: [...request.allowedEntryFees].sort((a, b) => a - b),
          allowedTurnTimers: [...request.allowedTurnTimers].sort((a, b) => a - b),
          createdById: actor.id,
        },
      });
      await this.audit(tx, actor, 'RULE_PRESET_CREATED', 'RULE_PRESET', created.id, {
        reason: request.reason,
        metadata: { version: created.version, activated: request.activate },
      });
      return created;
    });
    return (await this.rulePresets()).find((p) => p.id === preset.id)!;
  }

  // ─── Audit log ────────────────────────────────────────────────────────────

  async auditLog({ cursor, limit }: { cursor?: string; limit: number }): Promise<AdminAuditPage> {
    const rows = await this.prisma.adminAuditLog.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { actor: { select: { id: true, profile: { select: { displayName: true } } } } },
    });
    const items = rows.slice(0, limit);
    return {
      items: items.map((row) => ({
        id: row.id,
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        metadata: row.metadata,
        actor: row.actor
          ? { id: row.actor.id, displayName: row.actor.profile?.displayName ?? '' }
          : null,
        ipAddress: row.ipAddress,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit ? items.at(-1)!.id : null,
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private audit(
    tx: Prisma.TransactionClient,
    actor: AdminActor,
    action: string,
    targetType: string,
    targetId: string,
    details: { reason?: string; metadata?: Prisma.InputJsonValue } = {},
  ) {
    return tx.adminAuditLog.create({
      data: {
        actorId: actor.id,
        action,
        targetType,
        targetId,
        reason: details.reason ?? null,
        metadata: details.metadata,
        ipAddress: actor.ipAddress,
      },
    });
  }

  private toAdminUser(user: Prisma.UserGetPayload<{ include: typeof userInclude }>): AdminUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.profile?.displayName ?? '',
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerifiedAt !== null,
      suspensionReason: user.suspensionReason,
      createdAt: user.createdAt.toISOString(),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      balance: user.wallet?.balance ?? 0,
      matchesPlayed: user.profile?.matchesPlayed ?? 0,
      matchesWon: user.profile?.matchesWon ?? 0,
      activeSessions: user._count.sessions,
    };
  }

  private toAdminMatch(
    match: Prisma.MatchGetPayload<{ include: typeof matchInclude }>,
  ): AdminMatch {
    return {
      id: match.id,
      roomId: match.roomId,
      roomCode: match.room.code,
      status: match.status,
      entryFee: match.entryFee,
      flaggedForReview: match.flaggedForReview,
      abortReason: match.abortReason,
      startedAt: match.startedAt?.toISOString() ?? null,
      finishedAt: match.finishedAt?.toISOString() ?? null,
      settledAt: match.settledAt?.toISOString() ?? null,
      timeouts: match._count.events,
      openReports: match._count.reports,
      players: match.players.map((p) => ({
        userId: p.userId,
        displayName: p.user.profile?.displayName ?? '',
        seatIndex: p.seatIndex,
        placement: p.placement,
        coinDelta: p.coinDelta,
      })),
    };
  }
}
