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
 * Quick match: one first-come, first-served queue per entry fee. Four waiting players get a
 * ready public room and the match starts at once. Queue changes run one at a time.
 *
 * The queue is in process memory: a restart empties it (clients then see IDLE and can search
 * again), and several API instances would need a shared queue (see README, "Scaling").
 */
@Injectable()
export class MatchmakingService {
  private readonly logger = new Logger(MatchmakingService.name);
  private readonly queues = new Map<number, string[]>();
  private readonly searching = new Map<string, number>();
  private readonly matched = new Map<string, { roomId: string; entryFee: number }>();
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly presets: RulePresetsService,
    private readonly rooms: RoomsService,
    private readonly game: GameService,
    private readonly realtime: RealtimeService,
  ) {}

  async status(userId: string): Promise<MatchmakingStatus> {
    const entryFee = this.searching.get(userId);
    if (entryFee !== undefined) return { state: 'SEARCHING', entryFee, roomId: null };
    const match = this.matched.get(userId);
    if (match) {
      // Matched for as long as the player still sits in that room.
      const seat = await this.prisma.roomPlayer.findUnique({ where: { userId } });
      if (seat?.roomId === match.roomId) return { state: 'MATCHED', ...match };
      this.matched.delete(userId);
    }
    return IDLE;
  }

  async join(userId: string, entryFee: number): Promise<MatchmakingStatus> {
    const { options } = await this.presets.active();
    if (!options.entryFees.includes(entryFee)) {
      throw new AppException('VALIDATION_ERROR', HttpStatus.BAD_REQUEST, [
        { path: 'entryFee', message: 'Mức cược không hợp lệ.' },
      ]);
    }
    await this.serialized(async () => {
      if (this.searching.get(userId) === entryFee) return;
      if (await this.prisma.roomPlayer.findUnique({ where: { userId } })) {
        throw new AppException('ALREADY_IN_ROOM', HttpStatus.CONFLICT);
      }
      if (entryFee > 0) {
        const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
        if (!wallet || wallet.balance < entryFee) {
          throw new AppException('INSUFFICIENT_COINS', HttpStatus.CONFLICT);
        }
      }
      this.remove(userId);
      this.matched.delete(userId);
      this.searching.set(userId, entryFee);
      this.queue(entryFee).push(userId);
      await this.formMatches(entryFee);
    });
    return this.status(userId);
  }

  async cancel(userId: string): Promise<MatchmakingStatus> {
    await this.serialized(() => {
      this.remove(userId);
      return Promise.resolve();
    });
    return this.status(userId);
  }

  /** Called when the player takes a seat some other way (creating or joining a room). */
  async leaveQueue(userId: string): Promise<void> {
    if (!this.searching.has(userId)) return;
    await this.cancel(userId);
    this.realtime.matchmakingUpdated(userId, await this.status(userId));
  }

  private async formMatches(entryFee: number): Promise<void> {
    const queue = this.queue(entryFee);
    while (queue.length >= PLAYERS_PER_MATCH) {
      const group = queue.slice(0, PLAYERS_PER_MATCH);
      let roomId: string;
      try {
        roomId = await this.rooms.createQuickMatchRoom(group, entryFee);
      } catch (error) {
        if (!(error instanceof AppException) || error.code !== 'ALREADY_IN_ROOM') throw error;
        // Someone took a seat elsewhere meanwhile: drop them and try again.
        const seated = await this.prisma.roomPlayer.findMany({
          where: { userId: { in: group } },
          select: { userId: true },
        });
        for (const { userId } of seated) {
          this.remove(userId);
          this.realtime.matchmakingUpdated(userId, IDLE);
        }
        if (!seated.length) throw error;
        continue;
      }

      for (const userId of group) {
        this.remove(userId);
        this.matched.set(userId, { roomId, entryFee });
      }
      try {
        await this.game.start(roomId, null);
      } catch (error) {
        // The room stays READY with everyone seated; its host can still start it.
        this.logger.error(`Quick match ${roomId} did not start: ${describeError(error)}`);
      }
      for (const userId of group) {
        this.realtime.matchmakingUpdated(userId, { state: 'MATCHED', roomId, entryFee });
      }
    }
  }

  private queue(entryFee: number): string[] {
    let queue = this.queues.get(entryFee);
    if (!queue) this.queues.set(entryFee, (queue = []));
    return queue;
  }

  private remove(userId: string): void {
    const entryFee = this.searching.get(userId);
    if (entryFee === undefined) return;
    this.searching.delete(userId);
    const queue = this.queue(entryFee);
    queue.splice(queue.indexOf(userId), 1);
  }

  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.then(task, task);
    this.tail = run.catch(() => undefined);
    return run;
  }
}
