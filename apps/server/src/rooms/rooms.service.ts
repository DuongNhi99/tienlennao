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
  PLAYERS_PER_MATCH,
  type PublicPlayer,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_TRANSITIONS,
  type RoomDetail,
  type RoomListFilter,
  type RoomOptions,
  type RoomSummary,
  type UpdateRoomSettingsRequest,
} from '@tienlen/shared';
import { PasswordService } from '../auth/password.service';
import { AppException } from '../common/errors/app.exception';
import { describeError } from '../common/errors/describe-error';
import { isUniqueViolation, lockRoom } from '../common/prisma/prisma-helpers';
import type { Env } from '../config/env';
import { RulePresetsService } from '../game/rule-presets.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { UsersService } from '../users/users.service';

const OPEN_STATUSES: readonly RoomStatus[] = ['WAITING', 'READY', 'STARTING', 'IN_PROGRESS'];
const JOINABLE_STATUSES: readonly RoomStatus[] = ['WAITING', 'READY'];
const SWEEP_INTERVAL_MS = 15_000;
const LIST_LIMIT = 50;
const QUICK_MATCH_NAME = 'Ghép trận nhanh';
const QUICK_MATCH_TURN_TIMER = 30;

export const playerSelect = {
  id: true,
  profile: { select: { displayName: true, avatarUrl: true } },
} satisfies Prisma.UserSelect;
export type PlayerRecord = Prisma.UserGetPayload<{ select: typeof playerSelect }>;

const roomInclude = {
  players: { orderBy: { seatIndex: 'asc' }, include: { user: { select: playerSelect } } },
  matches: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: {
      id: true,
      stateVersion: true,
      players: { orderBy: { seatIndex: 'asc' }, include: { user: { select: playerSelect } } },
    },
  },
} satisfies Prisma.RoomInclude;
type RoomRecord = Prisma.RoomGetPayload<{ include: typeof roomInclude }>;

const roomError = {
  notFound: () => new AppException('ROOM_NOT_FOUND', HttpStatus.NOT_FOUND),
  started: () => new AppException('ROOM_ALREADY_STARTED', HttpStatus.CONFLICT),
  alreadyInRoom: () => new AppException('ALREADY_IN_ROOM', HttpStatus.CONFLICT),
  forbidden: () => new AppException('FORBIDDEN', HttpStatus.FORBIDDEN),
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
      include: { _count: { select: { players: true } } },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT * 2,
    });
    return rooms
      .filter(
        (room) =>
          !filter.onlyWithSeats ||
          (room.status === 'WAITING' && room._count.players < PLAYERS_PER_MATCH),
      )
      .sort(
        (a, b) =>
          Number(!JOINABLE_STATUSES.includes(a.status)) -
          Number(!JOINABLE_STATUSES.includes(b.status)),
      )
      .slice(0, LIST_LIMIT)
      .map((room) => ({
        id: room.id,
        code: room.code,
        name: room.name,
        visibility: room.visibility,
        hasPassword: room.passwordHash !== null,
        entryFee: room.entryFee,
        playerCount: room._count.players,
        maxPlayers: room.maxPlayers,
        status: room.status,
      }));
  }

  /** Members (and anyone, for public rooms) may view a room. */
  async detail(roomId: string, viewerId: string): Promise<RoomDetail> {
    const room = await this.prisma.room.findUnique({ where: { id: roomId }, include: roomInclude });
    if (!room) throw roomError.notFound();
    const detail = this.toDetail(room, viewerId);
    if (room.visibility === 'PRIVATE' && detail.mySeat === null) throw roomError.forbidden();
    return detail;
  }

  publicPlayer(user: PlayerRecord): PublicPlayer {
    return {
      userId: user.id,
      displayName: user.profile?.displayName ?? '',
      avatarUrl: this.users.publicAvatarUrl(user.profile?.avatarUrl ?? null),
    };
  }

  /** User IDs currently seated in a room. */
  async seatedUserIds(roomId: string): Promise<string[]> {
    const seats = await this.prisma.roomPlayer.findMany({
      where: { roomId },
      select: { userId: true },
    });
    return seats.map((seat) => seat.userId);
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
        const room = await this.prisma.room.create({
          data: {
            code: randomRoomCode(),
            name: request.name ?? null,
            hostId: userId,
            visibility: request.visibility,
            passwordHash,
            entryFee: request.entryFee,
            turnTimerSeconds: request.turnTimerSeconds,
            ruleConfigId: preset.id,
            createRequestId: request.requestId,
            expiresAt: this.expiry(),
            players: { create: { userId, seatIndex: 0 } },
          },
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

  async join(userId: string, roomId: string, password?: string): Promise<{ roomId: string }> {
    const seat = await this.prisma.roomPlayer.findUnique({ where: { userId } });
    if (seat?.roomId === roomId) return { roomId };
    if (seat) throw roomError.alreadyInRoom();

    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room || !OPEN_STATUSES.includes(room.status)) throw roomError.notFound();
    if (!JOINABLE_STATUSES.includes(room.status)) throw roomError.started();
    if (
      room.passwordHash &&
      !(password && (await this.passwords.verify(room.passwordHash, password)))
    ) {
      throw new AppException('INVALID_ROOM_PASSWORD', HttpStatus.FORBIDDEN);
    }
    await this.assertBalance(userId, room.entryFee);

    try {
      await this.prisma.$transaction(async (tx) => {
        await lockRoom(tx, roomId);
        const current = await tx.room.findUniqueOrThrow({
          where: { id: roomId },
          include: { players: true },
        });
        if (!JOINABLE_STATUSES.includes(current.status)) throw roomError.started();
        const taken = new Set(current.players.map((p) => p.seatIndex));
        const seatIndex = [0, 1, 2, 3].find((index) => !taken.has(index));
        if (seatIndex === undefined) throw new AppException('ROOM_FULL', HttpStatus.CONFLICT);
        await tx.roomPlayer.create({ data: { roomId, userId, seatIndex } });
        await tx.room.update({ where: { id: roomId }, data: { expiresAt: this.expiry() } });
        await this.refreshStatus(tx, roomId);
      });
    } catch (error) {
      if (isUniqueViolation(error, 'userId')) throw roomError.alreadyInRoom();
      throw error;
    }
    await this.notify(roomId, room.visibility === 'PUBLIC');
    return { roomId };
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

  async updateSettings(
    userId: string,
    roomId: string,
    settings: UpdateRoomSettingsRequest,
  ): Promise<RoomDetail> {
    const { options } = await this.presets.active();
    this.presets.assertAllowed(options, settings.entryFee, settings.turnTimerSeconds);
    await this.prisma.$transaction(async (tx) => {
      const room = await this.lockOpenRoom(tx, roomId);
      if (room.hostId !== userId) throw roomError.forbidden();
      if (!JOINABLE_STATUSES.includes(room.status)) throw roomError.started();
      await tx.room.update({
        where: { id: roomId },
        data: { ...settings, expiresAt: this.expiry() },
      });
      // Changed terms invalidate everyone's readiness.
      await tx.roomPlayer.updateMany({ where: { roomId }, data: { isReady: false } });
      await this.refreshStatus(tx, roomId);
    });
    await this.notify(roomId, true);
    return this.detail(roomId, userId);
  }

  /** Leaving a room you are not seated in is a no-op. Players cannot leave a running match. */
  async leave(userId: string, roomId: string): Promise<void> {
    const left = await this.prisma.$transaction(async (tx) => {
      if (!(await lockRoom(tx, roomId))) return false;
      return this.vacateSeat(tx, roomId, userId);
    });
    if (left) await this.notify(roomId, true, [userId]);
  }

  /** Records a user's realtime connection state on their seat (if any) and notifies the room. */
  async setConnected(userId: string, connected: boolean): Promise<void> {
    const seat = await this.prisma.roomPlayer.findUnique({ where: { userId } });
    if (!seat) return;
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
          select: { id: true, stateVersion: true },
        },
      },
    });
    const match = room?.status === 'IN_PROGRESS' ? room.matches[0] : undefined;
    if (match) {
      this.realtime.gameUpdated(
        { roomId, matchId: match.id, stateVersion: match.stateVersion },
        members,
      );
    }
  }

  /**
   * Builds a ready, public room for four matched players (quick match). Throws ALREADY_IN_ROOM
   * if any of them took a seat elsewhere in the meantime.
   */
  async createQuickMatchRoom(userIds: readonly string[], entryFee: number): Promise<string> {
    const preset = await this.presets.active();
    const turnTimerSeconds = preset.options.turnTimers.includes(QUICK_MATCH_TURN_TIMER)
      ? QUICK_MATCH_TURN_TIMER
      : preset.options.turnTimers[0]!;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const room = await tx.room.create({
            data: {
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
   * Housekeeping, run every 15 s: rooms that never started expire after ROOM_IDLE_MINUTES
   * without activity, and players disconnected from a waiting room for longer than
   * RECONNECT_GRACE_SECONDS lose their seat.
   */
  async sweep(now = new Date()): Promise<void> {
    const expired = await this.prisma.room.findMany({
      where: { status: { in: [...JOINABLE_STATUSES] }, expiresAt: { lt: now } },
      select: { id: true },
    });
    for (const { id } of expired) {
      const members = await this.seatedUserIds(id);
      const done = await this.prisma.$transaction(async (tx) => {
        await lockRoom(tx, id);
        const room = await tx.room.findUniqueOrThrow({ where: { id } });
        if (!JOINABLE_STATUSES.includes(room.status) || !room.expiresAt || room.expiresAt >= now) {
          return false;
        }
        assertTransition(ROOM_TRANSITIONS, room.status, 'EXPIRED');
        await tx.roomPlayer.deleteMany({ where: { roomId: id } });
        await tx.room.update({ where: { id }, data: { status: 'EXPIRED', closedAt: now } });
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
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private toDetail(room: RoomRecord, viewerId: string): RoomDetail {
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
    return {
      id: room.id,
      code: room.code,
      name: room.name,
      visibility: room.visibility,
      hasPassword: room.passwordHash !== null,
      entryFee: room.entryFee,
      playerCount: occupants.length,
      maxPlayers: room.maxPlayers,
      status: room.status,
      hostId: room.hostId,
      turnTimerSeconds: room.turnTimerSeconds,
      mySeat,
      matchId: match?.id ?? null,
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
    };
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

  /** WAITING ⇄ READY: READY exactly when all four seats are taken and everyone is ready. */
  private async refreshStatus(tx: Prisma.TransactionClient, roomId: string): Promise<void> {
    const room = await tx.room.findUniqueOrThrow({
      where: { id: roomId },
      include: { players: true },
    });
    if (!JOINABLE_STATUSES.includes(room.status)) return;
    const ready = room.players.length === PLAYERS_PER_MATCH && room.players.every((p) => p.isReady);
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
      await tx.room.update({
        where: { id: roomId },
        data: { status: 'CANCELLED', closedAt: new Date() },
      });
      return true;
    }
    if (room.hostId === userId) {
      await tx.room.update({ where: { id: roomId }, data: { hostId: remaining[0]!.userId } });
    }
    await this.refreshStatus(tx, roomId);
    return true;
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

  /** Tells everyone seated (plus `extra` users) that the room changed. */
  private async notify(roomId: string, listChanged: boolean, extra: string[] = []) {
    this.notifyUsers(roomId, [...(await this.seatedUserIds(roomId)), ...extra], listChanged);
  }

  private notifyUsers(roomId: string, userIds: string[], listChanged: boolean): void {
    this.realtime.roomUpdated(roomId, userIds);
    if (listChanged) this.realtime.roomsChanged();
  }
}
