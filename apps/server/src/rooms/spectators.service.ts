import { HttpStatus, Injectable } from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { AppException } from '../common/errors/app.exception';
import { isUniqueViolation, lockRoom } from '../common/prisma/prisma-helpers';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MAX_SPECTATORS, OPEN_STATUSES, roomError, RoomsService } from './rooms.service';

/**
 * Spectator mode (docs/GAME_RULES.md §21). A spectator watches an open room the host allows
 * spectators in: the same password applies as for a seat, removed users stay out, and a room
 * holds at most MAX_SPECTATORS. Spectators receive the room's notifications through
 * `spectatorChannel` and can only read the public projection of the match; they never act.
 */
@Injectable()
export class SpectatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly realtime: RealtimeService,
    private readonly rooms: RoomsService,
  ) {}

  async spectateByCode(userId: string, code: string, password?: string) {
    const room = await this.prisma.room.findUnique({ where: { code }, select: { id: true } });
    if (!room) throw roomError.notFound();
    return this.spectate(userId, room.id, password);
  }

  async spectate(userId: string, roomId: string, password?: string): Promise<{ roomId: string }> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { players: { select: { userId: true } } },
    });
    if (!room || !OPEN_STATUSES.includes(room.status)) throw roomError.notFound();
    if (!room.allowSpectators)
      throw new AppException('SPECTATORS_NOT_ALLOWED', HttpStatus.FORBIDDEN);
    if (room.removedUserIds.includes(userId)) throw roomError.forbidden();
    // A seated player plays; they do not also watch their own table.
    if (room.players.some((p) => p.userId === userId)) throw roomError.alreadyInRoom();
    const already = await this.prisma.roomSpectator.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (already) {
      this.realtime.joinSpectators(userId, roomId);
      return { roomId };
    }
    if (
      room.passwordHash &&
      !(password && (await this.passwords.verify(room.passwordHash, password)))
    ) {
      throw new AppException('INVALID_ROOM_PASSWORD', HttpStatus.FORBIDDEN);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await lockRoom(tx, roomId);
        const count = await tx.roomSpectator.count({ where: { roomId } });
        if (count >= MAX_SPECTATORS) throw roomError.full();
        await tx.roomSpectator.create({ data: { roomId, userId } });
      });
    } catch (error) {
      // A concurrent request from the same user got there first.
      if (!isUniqueViolation(error)) throw error;
    }
    this.realtime.joinSpectators(userId, roomId);
    this.realtime.roomUpdated(roomId, await this.rooms.seatedUserIds(roomId));
    return { roomId };
  }

  /** Leaving never affects the match. Leaving a room you do not watch is a no-op. */
  async leave(userId: string, roomId: string): Promise<void> {
    const { count } = await this.prisma.roomSpectator.deleteMany({ where: { roomId, userId } });
    this.realtime.leaveSpectators(userId, roomId);
    if (count > 0) this.realtime.roomUpdated(roomId, await this.rooms.seatedUserIds(roomId));
  }

  async isSpectator(roomId: string, userId: string): Promise<boolean> {
    const row = await this.prisma.roomSpectator.findUnique({
      where: { roomId_userId: { roomId, userId } },
      select: { room: { select: { allowSpectators: true } } },
    });
    return row?.room.allowSpectators === true;
  }

  async count(roomId: string): Promise<number> {
    return this.prisma.roomSpectator.count({ where: { roomId } });
  }

  /** Open rooms the user watches, so a new connection can rejoin their channels. */
  async watchedRoomIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.roomSpectator.findMany({
      where: { userId, room: { status: { in: [...OPEN_STATUSES] } } },
      select: { roomId: true },
    });
    return rows.map((row) => row.roomId);
  }
}
