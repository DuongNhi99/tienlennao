import { randomInt } from 'node:crypto';
import {
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, RoomStatus } from '@prisma/client';
import {
  assertTransition,
  type CreateRoomRequest,
  type CurrentRoom,
  gameRulesSchema,
  MIN_PLAYERS_PER_MATCH,
  type PublicPlayer,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_TRANSITIONS,
  type RoomDetail,
  type RoomListFilter,
  type RoomOptions,
  type RoomSummary,
  type SeriesSummary,
  type UpdateRoomSettingsRequest,
} from '@tienlen/shared';
import { PasswordService } from '../auth/password.service';
import { AppException } from '../common/errors/app.exception';
import { describeError } from '../common/errors/describe-error';
import { isUniqueViolation, lockMatch, lockRoom } from '../common/prisma/prisma-helpers';
import type { Env } from '../config/env';
import { RulePresetsService } from '../game/rule-presets.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { SeriesService } from '../series/series.service';
import { UsersService } from '../users/users.service';

export const OPEN_STATUSES: readonly RoomStatus[] = ['WAITING', 'READY', 'STARTING', 'IN_PROGRESS'];
export const JOINABLE_STATUSES: readonly RoomStatus[] = ['WAITING', 'READY'];
const SWEEP_INTERVAL_MS = 15_000;
const LIST_LIMIT = 50;
const QUICK_MATCH_NAME = 'Ghép trận nhanh';
const QUICK_MATCH_TURN_TIMER = 30;
/** Spectators per room. */
export const MAX_SPECTATORS = 20;

export const playerSelect = {
  id: true,
  profile: { select: { displayName: true, avatarUrl: true } },
} satisfies Prisma.UserSelect;
export type PlayerRecord = Prisma.UserGetPayload<{ select: typeof playerSelect }>;

const roomInclude = {
  players: { orderBy: { seatIndex: 'asc' }, include: { user: { select: playerSelect } } },
  spectators: { orderBy: { joinedAt: 'asc' }, include: { user: { select: playerSelect } } },
  matches: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      id: true,
      stateVersion: true,
      ruleSnapshot: true,
      players: { orderBy: { seatIndex: 'asc' }, include: { user: { select: playerSelect } } },
    },
  },
  rematchRoom: { select: { id: true, status: true } },
  ruleConfig: { select: { rules: true } },
} satisfies Prisma.RoomInclude;
type RoomRecord = Prisma.RoomGetPayload<{ include: typeof roomInclude }>;

const summaryInclude = {
  _count: { select: { players: true, spectators: true } },
} satisfies Prisma.RoomInclude;
type SummaryRecord = Prisma.RoomGetPayload<{ include: typeof summaryInclude }>;

export const roomError = {
  notFound: () => new AppException('ROOM_NOT_FOUND', HttpStatus.NOT_FOUND),
  started: () => new AppException('ROOM_ALREADY_STARTED', HttpStatus.CONFLICT),
  alreadyInRoom: () => new AppException('ALREADY_IN_ROOM', HttpStatus.CONFLICT),
  forbidden: () => new AppException('FORBIDDEN', HttpStatus.FORBIDDEN),
  full: () => new AppException('ROOM_FULL', HttpStatus.CONFLICT),
  invalid: (path: string, message: string) =>
    new AppException('VALIDATION_ERROR', HttpStatus.BAD_REQUEST, [{ path, message }]),
};

function randomRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Rooms and seats (docs: README "Rooms and matches"). Every change runs in a transaction that
 * locks the room row, so concurrent joins, readies and leaves are serialized per room, and
 * status changes follow ROOM_TRANSITIONS. A user holds at most one seat (unique
 * `room_players.userId`); seats are deleted when a player leaves or the room closes.
 */
@Injectable()
export class RoomsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomsService.name);
  private readonly idleMs: number;
  private readonly graceMs: number;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly presets: RulePresetsService,
    private readonly passwords: PasswordService,
    private readonly users: UsersService,
    private readonly realtime: RealtimeService,
    private readonly series: SeriesService,
    config: ConfigService<Env, true>,
  ) {
    this.idleMs = config.get('ROOM_IDLE_MINUTES', { infer: true }) * 60_000;
    this.graceMs = config.get('RECONNECT_GRACE_SECONDS', { infer: true }) * 1000;
  }

  onModuleInit(): void {
    this.sweepTimer = setInterval(() => {
      this.sweep().catch((error: unknown) =>
        this.logger.warn(`Room sweep failed: ${describeError(error)}`),
      );
    }, SWEEP_INTERVAL_MS);
    this.sweepTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  async options(): Promise<RoomOptions> {
    return (await this.presets.active()).options;
  }

  async list(filter: RoomListFilter): Promise<RoomSummary[]> {
    const rooms = await this.prisma.room.findMany({
      where: {
        visibility: 'PUBLIC',
        status: { in: [...OPEN_STATUSES] },
        ...(filter.maxEntryFee === undefined ? {} : { entryFee: { lte: filter.maxEntryFee } }),
      },
      include: summaryInclude,
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT * 2,
    });
    return rooms
      .filter(
        (room) =>
          !filter.onlyWithSeats ||
          (JOINABLE_STATUSES.includes(room.status) && room._count.players < room.maxPlayers),
      )
      .sort(
        (a, b) =>
          Number(!JOINABLE_STATUSES.includes(a.status)) -
          Number(!JOINABLE_STATUSES.includes(b.status)),
      )
      .slice(0, LIST_LIMIT)
      .map((room) => this.toSummary(room));
  }

  /** Members, spectators (and anyone, for public rooms) may view a room. */
  async detail(roomId: string, viewerId: string): Promise<RoomDetail> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId }, include: roomInclude });
    if (!room) throw roomError.notFound();
    const series = room.seriesId ? await this.series.summary(room.seriesId) : null;
    const detail = this.toDetail(room, viewerId, series);
    if (room.visibility === 'PRIVATE' && detail.mySeat === null && !detail.isSpectator) {
      throw roomError.forbidden();
    }
    return detail;
  }

  publicPlayer(user: PlayerRecord): PublicPlayer {
    return {
      userId: user.id,
      displayName: user.profile?.displayName ?? '',
      avatarUrl: this.users.publicAvatarUrl(user.profile?.avatarUrl ?? null),
    };
  }

  /**
   * The room the user is seated in, if any. Seats exist only in open rooms (they are deleted
   * when a room closes), so this is the unfinished game the user can continue.
   */
  async current(userId: string): Promise<CurrentRoom> {
    const seat = await this.prisma.roomPlayer.findUnique({
      where: { userId },
      select: { room: { include: summaryInclude } },
    });
    return { room: seat ? this.toSummary(seat.room) : null };
  }

  /** User IDs currently seated in a room. */
  async seatedUserIds(roomId: string): Promise<string[]> {
    const seats = await this.prisma.roomPlayer.findMany({
      where: { roomId },
      select: { userId: true },
    });
    return seats.map((seat) => seat.userId);
  }

  /** The rules a room's next match plays by: the host's choice, or the room's preset. */
  async rulesOf(room: { ruleSnapshot: Prisma.JsonValue; ruleConfigId: string | null }) {
    if (room.ruleSnapshot !== null) {
      const parsed = gameRulesSchema.safeParse(room.ruleSnapshot);
      if (!parsed.success) {
        throw new AppException('INTERNAL_ERROR', HttpStatus.INTERNAL_SERVER_ERROR);
      }
      return parsed.data;
    }
    return this.presets.rulesFor(room.ruleConfigId);
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  async create(userId: string, request: CreateRoomRequest): Promise<{ roomId: string }> {
    const existing = await this.findCreated(userId, request.requestId);
    if (existing) return { roomId: existing };

    const preset = await this.presets.active();
    this.presets.assertAllowed(preset.options, request.entryFee, request.turnTimerSeconds);
    await this.assertNotSeated(userId);
    await this.assertBalance(userId, request.entryFee);
    const passwordHash = request.password ? await this.passwords.hash(request.password) : null;

    for (let attempt = 0; ; attempt++) {
      try {
        const room = await this.prisma.$transaction(async (tx) => {
          const series = request.series
            ? await this.series.create(tx, userId, request.series)
            : null;
          return tx.room.create({
            data: {
              code: randomRoomCode(),
              name: request.name ?? null,
              hostId: userId,
              visibility: request.visibility,
              passwordHash,
              entryFee: request.entryFee,
              turnTimerSeconds: request.turnTimerSeconds,
              maxPlayers: request.maxPlayers,
              allowSpectators: request.allowSpectators,
              ruleConfigId: preset.id,
              ruleSnapshot: request.rules ?? undefined,
              seriesId: series?.id ?? null,
              roundNumber: series ? 1 : null,
              createRequestId: request.requestId,
              expiresAt: this.expiry(),
              players: { create: { userId, seatIndex: 0 } },
            },
          });
        });
        if (room.visibility === 'PUBLIC') this.realtime.roomsChanged();
        return { roomId: room.id };
      } catch (error) {
        if (isUniqueViolation(error, 'createRequestId')) {
          const winner = await this.findCreated(userId, request.requestId);
          if (winner) return { roomId: winner };
        }
        if (isUniqueViolation(error, 'userId')) throw roomError.alreadyInRoom();
        // Join codes are random; retry the rare collision.
        if (isUniqueViolation(error, 'code') && attempt < 5) continue;
        throw error;
      }
    }
  }

  async joinByCode(userId: string, code: string, password?: string): Promise<{ roomId: string }> {
    const room = await this.prisma.room.findUnique({ where: { code }, select: { id: true } });
    if (!room) throw roomError.notFound();
    return this.join(userId, room.id, password);
  }

  join(userId: string, roomId: string, password?: string): Promise<{ roomId: string }> {
    return this.seat(userId, roomId, { password });
  }

  /**
   * Seats an invited player: the invitation stands in for the room password. `inTransaction`
   * runs inside the seating transaction (after the room lock), so the invitation is consumed
   * exactly when the seat is taken.
   */
  joinInvited(
    userId: string,
    roomId: string,
    inTransaction: (tx: Prisma.TransactionClient) => Promise<void>,
  ): Promise<{ roomId: string }> {
    return this.seat(userId, roomId, { invited: inTransaction });
  }

  /**
   * "Play again" after a finished match. A finished room is never reused (ROOM_TRANSITIONS),
   * so the first of its players to ask opens a new room on the same terms and hosts it; the
   * others are seated there when they ask, without the private-room password. If that room
   * has started, filled up or closed in the meantime, the next player to ask opens another.
   * Rounds of a running series continue it (round + 1, same rules); after a finished series the
   * new room starts a new series with the same settings.
   */
  async rematch(userId: string, roomId: string): Promise<{ roomId: string }> {
    const previous = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        status: true,
        visibility: true,
        entryFee: true,
        rematchRoomId: true,
        matches: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { players: { select: { userId: true } } },
        },
      },
    });
    if (!previous) throw roomError.notFound();
    const matchPlayerIds = previous.matches[0]?.players.map((p) => p.userId) ?? [];
    if (!matchPlayerIds.includes(userId)) throw roomError.forbidden();
    // FINISHED is terminal, so this holds for the rest of the request.
    if (previous.status !== 'FINISHED') {
      throw OPEN_STATUSES.includes(previous.status) ? roomError.started() : roomError.notFound();
    }
    const seat = await this.prisma.roomPlayer.findUnique({ where: { userId } });
    if (seat && seat.roomId === previous.rematchRoomId) return { roomId: seat.roomId };
    if (seat) throw roomError.alreadyInRoom();
    await this.assertBalance(userId, previous.entryFee);
    const preset = await this.presets.active();

    for (let attempt = 0; ; attempt++) {
      try {
        const target = await this.prisma.$transaction(async (tx) => {
          await lockRoom(tx, roomId);
          const room = await tx.room.findUniqueOrThrow({
            where: { id: roomId },
            include: { series: true },
          });

          if (room.rematchRoomId && (await lockRoom(tx, room.rematchRoomId))) {
            const linked = await tx.room.findUniqueOrThrow({
              where: { id: room.rematchRoomId },
              include: { players: true },
            });
            if (
              JOINABLE_STATUSES.includes(linked.status) &&
              linked.players.length < linked.maxPlayers &&
              !linked.removedUserIds.includes(userId)
            ) {
              await this.takeSeat(tx, linked.id, userId);
              return linked.id;
            }
          }

          this.presets.assertAllowed(preset.options, room.entryFee, room.turnTimerSeconds);
          const series = await this.nextSeriesRound(tx, room, userId);
          const created = await tx.room.create({
            data: {
              code: randomRoomCode(),
              name: room.name,
              hostId: userId,
              visibility: room.visibility,
              passwordHash: room.passwordHash,
              entryFee: room.entryFee,
              turnTimerSeconds: room.turnTimerSeconds,
              maxPlayers: room.maxPlayers,
              allowSpectators: room.allowSpectators,
              ruleConfigId: preset.id,
              // The rules carry over; a series' own snapshot wins once its first round started.
              ruleSnapshot: series?.rules ?? room.ruleSnapshot ?? undefined,
              seriesId: series?.id ?? null,
              roundNumber: series?.roundNumber ?? null,
              expiresAt: this.expiry(),
              players: { create: { userId, seatIndex: 0 } },
            },
          });
          await tx.room.update({ where: { id: roomId }, data: { rematchRoomId: created.id } });
          return created.id;
        });
        await this.notify(target, previous.visibility === 'PUBLIC');
        // The other players' result screens offer to follow into the new room.
        this.realtime.roomUpdated(roomId, matchPlayerIds);
        return { roomId: target };
      } catch (error) {
        if (isUniqueViolation(error, 'userId')) throw roomError.alreadyInRoom();
        if (isUniqueViolation(error, 'code') && attempt < 5) continue;
        throw error;
      }
    }
  }

  async setReady(userId: string, roomId: string, ready: boolean): Promise<RoomDetail> {
    await this.prisma.$transaction(async (tx) => {
      const room = await this.lockOpenRoom(tx, roomId);
      const seat = room.players.find((p) => p.userId === userId);
      if (!seat) throw roomError.forbidden();
      if (!JOINABLE_STATUSES.includes(room.status)) throw roomError.started();
      await tx.roomPlayer.update({ where: { id: seat.id }, data: { isReady: ready } });
      await tx.room.update({ where: { id: roomId }, data: { expiresAt: this.expiry() } });
      await this.refreshStatus(tx, roomId);
    });
    await this.notify(roomId, true);
    return this.detail(roomId, userId);
  }

  /**
   * Host-only, before the start. Changing anything resets everyone's readiness. Rules are fixed
   * for a whole series once its first round has started (docs/GAME_RULES.md §20).
   */
  async updateSettings(
    userId: string,
    roomId: string,
    settings: UpdateRoomSettingsRequest,
  ): Promise<RoomDetail> {
    const { options } = await this.presets.active();
    this.presets.assertAllowed(options, settings.entryFee, settings.turnTimerSeconds);
    const removedSpectators = await this.prisma.$transaction(async (tx) => {
      const room = await this.lockOpenRoom(tx, roomId);
      if (room.hostId !== userId) throw roomError.forbidden();
      if (!JOINABLE_STATUSES.includes(room.status)) throw roomError.started();
      if (settings.maxPlayers !== undefined && settings.maxPlayers < room.players.length) {
        throw roomError.invalid('maxPlayers', 'Số chỗ không được ít hơn số người đang ngồi.');
      }
      if (
        settings.maxPlayers !== undefined &&
        room.players.some((p) => p.seatIndex >= settings.maxPlayers!)
      ) {
        throw roomError.invalid('maxPlayers', 'Có người đang ngồi ở chỗ sẽ bị bỏ.');
      }
      if (
        settings.rules !== undefined &&
        room.seriesId &&
        (await this.series.rulesLocked(tx, room.seriesId))
      ) {
        throw roomError.invalid('rules', 'Luật đã cố định cho cả chuỗi ván.');
      }
      await tx.room.update({
        where: { id: roomId },
        data: {
          entryFee: settings.entryFee,
          turnTimerSeconds: settings.turnTimerSeconds,
          ...(settings.maxPlayers === undefined ? {} : { maxPlayers: settings.maxPlayers }),
          ...(settings.allowSpectators === undefined
            ? {}
            : { allowSpectators: settings.allowSpectators }),
          ...(settings.rules === undefined ? {} : { ruleSnapshot: settings.rules }),
          expiresAt: this.expiry(),
        },
      });
      // Changed terms invalidate everyone's readiness.
      await tx.roomPlayer.updateMany({ where: { roomId }, data: { isReady: false } });
      await this.refreshStatus(tx, roomId);
      if (settings.allowSpectators !== false) return [];
      const watching = await tx.roomSpectator.findMany({ where: { roomId } });
      await tx.roomSpectator.deleteMany({ where: { roomId } });
      return watching.map((s) => s.userId);
    });
    for (const spectator of removedSpectators) this.realtime.leaveSpectators(spectator, roomId);
    await this.notify(roomId, true, removedSpectators);
    return this.detail(roomId, userId);
  }

  /**
   * Host-only, before the start: removes a seated player or a spectator. Removed users cannot
   * come back to this room (as a player or a spectator).
   */
  async removeMember(hostId: string, roomId: string, targetId: string): Promise<RoomDetail> {
    if (targetId === hostId) throw roomError.invalid('userId', 'Bạn không thể tự mời mình ra.');
    await this.prisma.$transaction(async (tx) => {
      const room = await this.lockOpenRoom(tx, roomId);
      if (room.hostId !== hostId) throw roomError.forbidden();
      if (!JOINABLE_STATUSES.includes(room.status)) throw roomError.started();
      const seated = room.players.some((p) => p.userId === targetId);
      const { count: watching } = await tx.roomSpectator.deleteMany({
        where: { roomId, userId: targetId },
      });
      if (!seated && watching === 0) throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
      if (seated) await this.vacateSeat(tx, roomId, targetId);
      await tx.room.update({
        where: { id: roomId },
        data: { removedUserIds: { push: targetId } },
      });
    });
    this.realtime.leaveSpectators(targetId, roomId);
    await this.notify(roomId, true, [targetId]);
    return this.detail(roomId, hostId);
  }

  /** Host-only, before the start: cancels the room for everyone. */
  async close(hostId: string, roomId: string): Promise<void> {
    const members = await this.memberIds(roomId);
    await this.prisma.$transaction(async (tx) => {
      const room = await this.lockOpenRoom(tx, roomId);
      if (room.hostId !== hostId) throw roomError.forbidden();
      if (!JOINABLE_STATUSES.includes(room.status)) throw roomError.started();
      assertTransition(ROOM_TRANSITIONS, room.status, 'CANCELLED');
      await this.closeRoom(tx, roomId, 'CANCELLED');
    });
    this.notifyUsers(roomId, members, true);
  }

  /** Leaving a room you are not seated in is a no-op. Players cannot leave a running match. */
  async leave(userId: string, roomId: string): Promise<void> {
    const left = await this.prisma.$transaction(async (tx) => {
      if (!(await lockRoom(tx, roomId))) return false;
      return this.vacateSeat(tx, roomId, userId);
    });
    if (left) await this.notify(roomId, true, [userId]);
  }

  /**
   * Records a user's realtime connection state on their seat (if any) and notifies the room.
   * During a match, a change is also written to the match's event log (PLAYER_DISCONNECTED /
   * PLAYER_RECONNECTED); the hand, seat and turn are untouched.
   */
  async setConnected(userId: string, connected: boolean): Promise<void> {
    const seat = await this.prisma.roomPlayer.findUnique({ where: { userId } });
    if (!seat) return;
    const changed = (seat.disconnectedAt === null) !== connected;
    await this.prisma.roomPlayer.update({
      where: { id: seat.id },
      data: { disconnectedAt: connected ? null : new Date() },
    });
    const { roomId } = seat;
    const members = await this.seatedUserIds(roomId);
    this.realtime.roomUpdated(roomId, members);
    // Opponents see the change on the game table as well.
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: {
        status: true,
        matches: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, stateVersion: true, status: true },
        },
      },
    });
    const match = room?.status === 'IN_PROGRESS' ? room.matches[0] : undefined;
    if (!match) return;
    if (changed && match.status === 'PLAYING') {
      await this.recordPresence(match.id, userId, connected).catch((error: unknown) =>
        this.logger.warn(`Could not record a presence event: ${describeError(error)}`),
      );
    }
    this.realtime.gameUpdated(
      { roomId, matchId: match.id, stateVersion: match.stateVersion },
      members,
    );
  }

  /**
   * Builds a ready, public room for four matched players (quick match). Throws ALREADY_IN_ROOM
   * if any of them took a seat elsewhere in the meantime.
   */
  async createQuickMatchRoom(
    userIds: readonly string[],
    entryFee: number,
    /** Chosen by the caller, so the queue can record the room before it exists. */
    roomId?: string,
  ): Promise<string> {
    const preset = await this.presets.active();
    const turnTimerSeconds = preset.options.turnTimers.includes(QUICK_MATCH_TURN_TIMER)
      ? QUICK_MATCH_TURN_TIMER
      : preset.options.turnTimers[0]!;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const room = await tx.room.create({
            data: {
              ...(roomId ? { id: roomId } : {}),
              code: randomRoomCode(),
              name: QUICK_MATCH_NAME,
              hostId: userIds[0]!,
              visibility: 'PUBLIC',
              entryFee,
              turnTimerSeconds,
              ruleConfigId: preset.id,
              expiresAt: this.expiry(),
              players: {
                create: userIds.map((userId, seatIndex) => ({ userId, seatIndex, isReady: true })),
              },
            },
          });
          await this.refreshStatus(tx, room.id);
          return room.id;
        });
      } catch (error) {
        if (isUniqueViolation(error, 'userId')) throw roomError.alreadyInRoom();
        if (isUniqueViolation(error, 'code') && attempt < 5) continue;
        throw error;
      }
    }
  }

  /**
   * Closes a room inside the caller's transaction: frees its seats, removes its spectators and
   * cancels its pending invitations. The caller holds the room lock and checked the transition.
   */
  async closeRoom(
    tx: Prisma.TransactionClient,
    roomId: string,
    status: 'FINISHED' | 'CANCELLED' | 'EXPIRED',
  ): Promise<void> {
    await tx.roomPlayer.deleteMany({ where: { roomId } });
    await this.cancelInvitations(tx, roomId);
    await tx.room.update({ where: { id: roomId }, data: { status, closedAt: new Date() } });
  }

  /** Pending invitations of a room that starts or closes can no longer be used. */
  async cancelInvitations(tx: Prisma.TransactionClient, roomId: string): Promise<void> {
    await tx.roomInvitation.updateMany({
      where: { roomId, status: 'PENDING' },
      data: { status: 'CANCELLED', respondedAt: new Date() },
    });
  }

  /**
   * Housekeeping, run every 15 s: rooms that never started expire after ROOM_IDLE_MINUTES
   * without activity, players disconnected from a waiting room for longer than
   * RECONNECT_GRACE_SECONDS lose their seat, and overdue invitations are marked EXPIRED.
   */
  async sweep(now = new Date()): Promise<void> {
    const expired = await this.prisma.room.findMany({
      where: { status: { in: [...JOINABLE_STATUSES] }, expiresAt: { lt: now } },
      select: { id: true },
    });
    for (const { id } of expired) {
      const members = await this.memberIds(id);
      const done = await this.prisma.$transaction(async (tx) => {
        await lockRoom(tx, id);
        const room = await tx.room.findUniqueOrThrow({ where: { id } });
        if (!JOINABLE_STATUSES.includes(room.status) || !room.expiresAt || room.expiresAt >= now) {
          return false;
        }
        assertTransition(ROOM_TRANSITIONS, room.status, 'EXPIRED');
        await this.closeRoom(tx, id, 'EXPIRED');
        return true;
      });
      if (done) this.notifyUsers(id, members, true);
    }

    const stale = await this.prisma.roomPlayer.findMany({
      where: {
        disconnectedAt: { lt: new Date(now.getTime() - this.graceMs) },
        room: { status: { in: [...JOINABLE_STATUSES] } },
      },
      select: { userId: true, roomId: true },
    });
    for (const { userId, roomId } of stale) {
      // The room may have started since the query; that seat then stays.
      await this.leave(userId, roomId).catch((error: unknown) => {
        if (!(error instanceof AppException)) throw error;
      });
    }

    await this.prisma.roomInvitation.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private toSummary(room: SummaryRecord): RoomSummary {
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      visibility: room.visibility,
      hasPassword: room.passwordHash !== null,
      entryFee: room.entryFee,
      playerCount: room._count.players,
      maxPlayers: room.maxPlayers,
      status: room.status,
      allowSpectators: room.allowSpectators,
      spectatorCount: room._count.spectators,
      roundNumber: room.roundNumber,
    };
  }

  private toDetail(room: RoomRecord, viewerId: string, series: SeriesSummary | null): RoomDetail {
    const match = room.matches[0] ?? null;
    // While the room is open, seats are the room's; afterwards, the match's players.
    const occupants = OPEN_STATUSES.includes(room.status)
      ? room.players.map((p) => ({
          seatIndex: p.seatIndex,
          user: p.user,
          isReady: p.isReady,
          connected: p.disconnectedAt === null,
        }))
      : (match?.players ?? []).map((p) => ({
          seatIndex: p.seatIndex,
          user: p.user,
          isReady: false,
          connected: true,
        }));
    const mySeat = occupants.find((o) => o.user.id === viewerId)?.seatIndex ?? null;
    // After the start the match's snapshot is the truth; before it, the room's choice.
    const rulesSource =
      OPEN_STATUSES.includes(room.status) && room.status !== 'IN_PROGRESS'
        ? (room.ruleSnapshot ?? room.ruleConfig?.rules ?? null)
        : (match?.ruleSnapshot ?? room.ruleSnapshot ?? room.ruleConfig?.rules ?? null);
    const rules = gameRulesSchema.safeParse(rulesSource);
    return {
      ...this.toSummary({
        ...room,
        _count: { players: occupants.length, spectators: room.spectators.length },
      }),
      hostId: room.hostId,
      turnTimerSeconds: room.turnTimerSeconds,
      mySeat,
      matchId: match?.id ?? null,
      rematchRoomId:
        room.rematchRoom && JOINABLE_STATUSES.includes(room.rematchRoom.status)
          ? room.rematchRoom.id
          : null,
      seats: [0, 1, 2, 3].map((seatIndex) => {
        const occupant = occupants.find((o) => o.seatIndex === seatIndex);
        return {
          seatIndex,
          player: occupant
            ? {
                ...this.publicPlayer(occupant.user),
                isReady: occupant.isReady,
                isHost: occupant.user.id === room.hostId,
                connected: occupant.connected,
              }
            : null,
        };
      }),
      rules: rules.success ? rules.data : null,
      isSpectator: mySeat === null && room.spectators.some((s) => s.userId === viewerId),
      spectators: room.spectators.map((s) => this.publicPlayer(s.user)),
      series,
    };
  }

  /**
   * The series round a rematch room plays: the next round of a running series, round 1 of a new
   * series with the same settings after a finished one, or none for single-round rooms.
   */
  private async nextSeriesRound(
    tx: Prisma.TransactionClient,
    room: Prisma.RoomGetPayload<{ include: { series: true } }>,
    userId: string,
  ): Promise<{ id: string; roundNumber: number; rules: Prisma.JsonValue | null } | null> {
    const { series } = room;
    if (!series) return null;
    if (series.status === 'IN_PROGRESS') {
      const last = await tx.room.aggregate({
        where: { seriesId: series.id },
        _max: { roundNumber: true },
      });
      return {
        id: series.id,
        roundNumber: (last._max.roundNumber ?? room.roundNumber ?? 0) + 1,
        rules: series.ruleSnapshot,
      };
    }
    const fresh = await this.series.create(tx, userId, {
      endCondition: series.endCondition,
      targetRounds: series.targetRounds,
      targetScore: series.targetScore,
    });
    return { id: fresh.id, roundNumber: 1, rules: series.ruleSnapshot };
  }

  /** Shared by `join` and `joinInvited`. */
  private async seat(
    userId: string,
    roomId: string,
    access: { password?: string; invited?: (tx: Prisma.TransactionClient) => Promise<void> },
  ): Promise<{ roomId: string }> {
    const seat = await this.prisma.roomPlayer.findUnique({ where: { userId } });
    if (seat?.roomId === roomId) return { roomId };
    if (seat) throw roomError.alreadyInRoom();

    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room || !OPEN_STATUSES.includes(room.status)) throw roomError.notFound();
    if (!JOINABLE_STATUSES.includes(room.status)) throw roomError.started();
    if (room.removedUserIds.includes(userId)) throw roomError.forbidden();
    if (
      !access.invited &&
      room.passwordHash &&
      !(access.password && (await this.passwords.verify(room.passwordHash, access.password)))
    ) {
      throw new AppException('INVALID_ROOM_PASSWORD', HttpStatus.FORBIDDEN);
    }
    await this.assertBalance(userId, room.entryFee);

    try {
      await this.prisma.$transaction(async (tx) => {
        await lockRoom(tx, roomId);
        await this.takeSeat(tx, roomId, userId);
        await access.invited?.(tx);
      });
    } catch (error) {
      if (isUniqueViolation(error, 'userId')) throw roomError.alreadyInRoom();
      throw error;
    }
    this.realtime.leaveSpectators(userId, roomId);
    await this.notify(roomId, room.visibility === 'PUBLIC');
    return { roomId };
  }

  private async lockOpenRoom(tx: Prisma.TransactionClient, roomId: string) {
    if (!(await lockRoom(tx, roomId))) throw roomError.notFound();
    const room = await tx.room.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });
    if (!OPEN_STATUSES.includes(room.status)) throw roomError.notFound();
    return room;
  }

  /**
   * Seats a user in the first free seat of a joinable room (and ends their spectating there).
   * The caller holds the room lock.
   */
  private async takeSeat(
    tx: Prisma.TransactionClient,
    roomId: string,
    userId: string,
  ): Promise<void> {
    const room = await tx.room.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });
    if (!JOINABLE_STATUSES.includes(room.status)) throw roomError.started();
    if (room.removedUserIds.includes(userId)) throw roomError.forbidden();
    const taken = new Set(room.players.map((p) => p.seatIndex));
    const seatIndex = Array.from({ length: room.maxPlayers }, (_, i) => i).find(
      (index) => !taken.has(index),
    );
    if (seatIndex === undefined) throw roomError.full();
    await tx.roomPlayer.create({ data: { roomId, userId, seatIndex } });
    await tx.roomSpectator.deleteMany({ where: { roomId, userId } });
    await tx.room.update({ where: { id: roomId }, data: { expiresAt: this.expiry() } });
    await this.refreshStatus(tx, roomId);
  }

  /**
   * WAITING ⇄ READY: READY when at least two players are seated and every seated player is
   * ready. The host may then start; empty seats stay open until the match starts.
   */
  private async refreshStatus(tx: Prisma.TransactionClient, roomId: string): Promise<void> {
    const room = await tx.room.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });
    if (!JOINABLE_STATUSES.includes(room.status)) return;
    const ready =
      room.players.length >= MIN_PLAYERS_PER_MATCH && room.players.every((p) => p.isReady);
    const next: RoomStatus = ready ? 'READY' : 'WAITING';
    if (next === room.status) return;
    assertTransition(ROOM_TRANSITIONS, room.status, next);
    await tx.room.update({ where: { id: roomId }, data: { status: next } });
  }

  /** Removes a seat; hands the host role on, or cancels the room when it empties. */
  private async vacateSeat(
    tx: Prisma.TransactionClient,
    roomId: string,
    userId: string,
  ): Promise<boolean> {
    const room = await tx.room.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: { orderBy: { joinedAt: 'asc' } } },
    });
    const seat = room.players.find((p) => p.userId === userId);
    if (!seat) return false;
    if (!JOINABLE_STATUSES.includes(room.status)) throw roomError.started();

    await tx.roomPlayer.delete({ where: { id: seat.id } });
    const remaining = room.players.filter((p) => p.id !== seat.id);
    if (remaining.length === 0) {
      assertTransition(ROOM_TRANSITIONS, room.status, 'CANCELLED');
      await this.closeRoom(tx, roomId, 'CANCELLED');
      return true;
    }
    if (room.hostId === userId) {
      await tx.room.update({ where: { id: roomId }, data: { hostId: remaining[0]!.userId } });
    }
    await this.refreshStatus(tx, roomId);
    return true;
  }

  /** Appends a presence change to a running match's log, under the match lock. */
  private async recordPresence(matchId: string, userId: string, connected: boolean) {
    await this.prisma.$transaction(async (tx) => {
      await lockMatch(tx, matchId);
      const match = await tx.match.findUniqueOrThrow({
        where: { id: matchId },
        select: { status: true, stateVersion: true, players: { where: { userId } } },
      });
      const player = match.players[0];
      if (match.status !== 'PLAYING' || !player) return;
      const last = await tx.matchEvent.aggregate({ where: { matchId }, _max: { sequence: true } });
      await tx.matchEvent.create({
        data: {
          matchId,
          sequence: (last._max.sequence ?? -1) + 1,
          type: connected ? 'PLAYER_RECONNECTED' : 'PLAYER_DISCONNECTED',
          actorUserId: userId,
          payload: { seat: player.seatIndex },
          stateVersion: match.stateVersion,
        },
      });
    });
  }

  private async findCreated(userId: string, requestId: string): Promise<string | null> {
    const room = await this.prisma.room.findUnique({
      where: { hostId_createRequestId: { hostId: userId, createRequestId: requestId } },
      select: { id: true },
    });
    return room?.id ?? null;
  }

  private async assertNotSeated(userId: string): Promise<void> {
    if (await this.prisma.roomPlayer.findUnique({ where: { userId } })) {
      throw roomError.alreadyInRoom();
    }
  }

  /** Joining needs enough coins for the fee, which is charged when the match starts. */
  private async assertBalance(userId: string, entryFee: number): Promise<void> {
    if (entryFee === 0) return;
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet || wallet.balance < entryFee) {
      throw new AppException('INSUFFICIENT_COINS', HttpStatus.CONFLICT);
    }
  }

  private expiry(): Date {
    return new Date(Date.now() + this.idleMs);
  }

  /** Seated players and spectators of a room. */
  private async memberIds(roomId: string): Promise<string[]> {
    const [seated, spectators] = await Promise.all([
      this.seatedUserIds(roomId),
      this.prisma.roomSpectator.findMany({ where: { roomId }, select: { userId: true } }),
    ]);
    return [...seated, ...spectators.map((s) => s.userId)];
  }

  /** Tells everyone seated (plus `extra` users, plus spectators) that the room changed. */
  private async notify(roomId: string, listChanged: boolean, extra: string[] = []) {
    this.notifyUsers(roomId, [...(await this.seatedUserIds(roomId)), ...extra], listChanged);
  }

  private notifyUsers(roomId: string, userIds: string[], listChanged: boolean): void {
    this.realtime.roomUpdated(roomId, userIds);
    if (listChanged) this.realtime.roomsChanged();
  }
}
