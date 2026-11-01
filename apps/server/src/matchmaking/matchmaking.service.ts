import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { type MatchmakingStatus, PLAYERS_PER_MATCH } from '@tienlen/shared';
import { AppException } from '../common/errors/app.exception';
import { describeError } from '../common/errors/describe-error';
import { GameService } from '../game/game.service';
import { RulePresetsService } from '../game/rule-presets.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RoomsService } from '../rooms/rooms.service';

const IDLE: MatchmakingStatus = { state: 'IDLE', entryFee: null, roomId: null };

/**
 * Quick match: one first-come, first-served queue per entry fee, stored in PostgreSQL
 * (`matchmaking_entries`) so every API instance shares it and a restart loses nothing.
 * Four waiting players are claimed together under a per-fee advisory lock, get a ready public
 * room and the match starts at once. Quick match always waits for a full table of four.
 */
@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly presets: RulePresetsService,
    private readonly rooms: RoomsService,
    private readonly game: GameService,
    private readonly realtime: RealtimeService,
  ) {}

  async status(userId: string): Promise<MatchmakingStatus> {
    const entry = await this.prisma.matchmakingEntry.findUnique({ where: { userId } });
    if (!entry) return IDLE;
    if (entry.roomId === null)
      return { state: 'SEARCHING', entryFee: entry.entryFee, roomId: null };

    // One query, so the room and its seats are seen together: they are created in one
    // transaction, and reading them separately could catch the room without the seat.
    const room = await this.prisma.room.findUnique({
      where: { id: entry.roomId },
      select: { players: { where: { userId }, select: { id: true } } },
    });
    // Claimed, but the room is still being created: keep showing the search.
    if (!room) return { state: 'SEARCHING', entryFee: entry.entryFee, roomId: null };
    // Matched for as long as the player still sits in that room.
    if (room.players.length > 0) {
      return { state: 'MATCHED', entryFee: entry.entryFee, roomId: entry.roomId };
    }
    await this.prisma.matchmakingEntry.deleteMany({ where: { userId, roomId: entry.roomId } });
    return IDLE;
  }

  async join(userId: string, entryFee: number): Promise<MatchmakingStatus> {
    const { options } = await this.presets.active();
    if (!options.entryFees.includes(entryFee)) {
      throw new AppException('VALIDATION_ERROR', HttpStatus.BAD_REQUEST, [
        { path: 'entryFee', message: 'Mức cược không hợp lệ.' },
      ]);
    }
    if (await this.prisma.roomPlayer.findUnique({ where: { userId } })) {
      throw new AppException('ALREADY_IN_ROOM', HttpStatus.CONFLICT);
    }
    if (entryFee > 0) {
      const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance < entryFee) {
        throw new AppException('INSUFFICIENT_COINS', HttpStatus.CONFLICT);
      }
    }
    const current = await this.prisma.matchmakingEntry.findUnique({ where: { userId } });
    // Searching again at the same fee keeps the place in the queue.
    if (!(current && current.roomId === null && current.entryFee === entryFee)) {
      await this.prisma.matchmakingEntry.upsert({
        where: { userId },
        create: { userId, entryFee },
        update: { entryFee, roomId: null, createdAt: new Date() },
      });
    }
    await this.formMatches(entryFee);
    return this.status(userId);
  }

  async cancel(userId: string): Promise<MatchmakingStatus> {
    await this.prisma.matchmakingEntry.deleteMany({ where: { userId, roomId: null } });
    return this.status(userId);
  }

  /** Called when the player takes a seat some other way (creating or joining a room). */
  async leaveQueue(userId: string): Promise<void> {
    const { count } = await this.prisma.matchmakingEntry.deleteMany({
      where: { userId, roomId: null },
    });
    if (count > 0) this.realtime.matchmakingUpdated(userId, IDLE);
  }

  /** Forms as many tables of four as the queue for this fee allows. */
  private async formMatches(entryFee: number): Promise<void> {
    for (;;) {
      const roomId = randomUUID();
      const group = await this.claimGroup(entryFee, roomId);
      if (!group) return;

      try {
        await this.rooms.createQuickMatchRoom(group, entryFee, roomId);
      } catch (error) {
        if (!(error instanceof AppException) || error.code !== 'ALREADY_IN_ROOM') throw error;
        // Someone took a seat elsewhere meanwhile: drop them, put the others back, retry.
        const seated = await this.prisma.roomPlayer.findMany({
          where: { userId: { in: group } },
          select: { userId: true },
        });
        const seatedIds = seated.map((s) => s.userId);
        await this.prisma.$transaction([
          this.prisma.matchmakingEntry.deleteMany({ where: { userId: { in: seatedIds }, roomId } }),
          this.prisma.matchmakingEntry.updateMany({ where: { roomId }, data: { roomId: null } }),
        ]);
        for (const userId of seatedIds) this.realtime.matchmakingUpdated(userId, IDLE);
        if (!seatedIds.length) throw error;
        continue;
      }

      try {
        await this.game.start(roomId, null);
      } catch (error) {
        // The room stays READY with everyone seated; its host can still start it.
        this.logger.error(`Quick match ${roomId} did not start: ${describeError(error)}`);
      }
      for (const userId of group) {
        this.realtime.matchmakingUpdated(userId, { state: 'MATCHED', entryFee, roomId });
      }
    }
  }

  /**
   * Claims the four longest-waiting players for this fee by recording `roomId` on their
   * entries. The advisory lock makes concurrent claims (from any instance) take turns.
   */
  private claimGroup(entryFee: number, roomId: string): Promise<string[] | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`matchmaking:${entryFee}`}))`;
      const entries = await tx.matchmakingEntry.findMany({
        where: { entryFee, roomId: null },
        orderBy: { createdAt: 'asc' },
        take: PLAYERS_PER_MATCH,
        select: { userId: true },
      });
      if (entries.length < PLAYERS_PER_MATCH) return null;
      const userIds = entries.map((e) => e.userId);
      await tx.matchmakingEntry.updateMany({
        where: { userId: { in: userIds } },
        data: { roomId },
      });
      return userIds;
    });
  }
}
