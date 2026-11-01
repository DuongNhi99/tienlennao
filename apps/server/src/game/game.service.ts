import {
  HttpStatus,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type ActionResult,
  applyPass,
  applyPlay,
  applyTimeout,
  assertTransition,
  calculateMatchResult,
  canPass,
  type EngineEvent,
  type ErrorCode,
  GAME_VIOLATION_ERROR_CODES,
  MATCH_TRANSITIONS,
  type MatchResult,
  type MatchState,
  type PassRequest,
  type PlayCardsRequest,
  type PlayerGameView,
  playerGameViewSchema,
  ROOM_TRANSITIONS,
  startMatch,
} from '@tienlen/shared';
import { AppException } from '../common/errors/app.exception';
import { describeError } from '../common/errors/describe-error';
import { lockMatch, lockRoom } from '../common/prisma/prisma-helpers';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { playerSelect, RoomsService } from '../rooms/rooms.service';
import { Dealer } from './dealer';
import { RulePresetsService } from './rule-presets.service';

/** Extra time after the displayed deadline before the timeout action runs (network latency). */
const TURN_GRACE_MS = 1_000;

/** `matches.stateSnapshot`: the engine state plus the server-owned turn deadline. */
interface MatchSnapshot {
  v: 1;
  engine: MatchState;
  turnDeadline: string | null;
}

function readSnapshot(value: Prisma.JsonValue | null): MatchSnapshot {
  const snapshot = value as Partial<MatchSnapshot> | null;
  if (snapshot?.v !== 1 || !snapshot.engine) throw new Error('Unreadable match snapshot');
  return snapshot as MatchSnapshot;
}

const viewInclude = {
  players: { orderBy: { seatIndex: 'asc' }, include: { user: { select: playerSelect } } },
  room: { select: { players: { select: { userId: true, disconnectedAt: true } } } },
} satisfies Prisma.MatchInclude;

const BAD_REQUEST_CODES: ReadonlySet<ErrorCode> = new Set([
  'INVALID_CARD_SELECTION',
  'INVALID_COMBINATION',
]);

function violationError(code: ErrorCode): AppException {
  const status = BAD_REQUEST_CODES.has(code)
    ? HttpStatus.BAD_REQUEST
    : code === 'FORBIDDEN'
      ? HttpStatus.FORBIDDEN
      : HttpStatus.CONFLICT;
  return new AppException(code, status);
}

interface Committed {
  matchId: string;
  roomId: string;
  stateVersion: number;
  playerIds: string[];
  finished: boolean;
  deadline: Date | null;
}

/**
 * The authoritative match service. The rules engine (@tienlen/shared) decides legality; this
 * service adds identity, idempotency, state versions, persistence and turn deadlines:
 *
 * - Every action runs in a transaction holding the match row lock, so actions on one match
 *   are applied one at a time, by any API instance.
 * - An action ID that was already applied is answered with the current state, unchanged.
 * - An action decided on an older state version is rejected with STALE_STATE.
 * - The state snapshot and the event log are written together with the new version.
 * - Turn deadlines live in the snapshot. In-process timers apply the timeout action, and are
 *   rebuilt from the database when the server starts.
 */
@Injectable()
export class GameService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(GameService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly presets: RulePresetsService,
    private readonly rooms: RoomsService,
    private readonly realtime: RealtimeService,
    private readonly dealer: Dealer,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const playing = await this.prisma.match.findMany({
        where: { status: 'PLAYING' },
        select: { id: true, stateVersion: true, stateSnapshot: true },
      });
      for (const match of playing) {
        const { turnDeadline } = readSnapshot(match.stateSnapshot);
        if (turnDeadline) this.schedule(match.id, match.stateVersion, new Date(turnDeadline));
      }
      if (playing.length) this.logger.log(`Resumed turn timers for ${playing.length} match(es)`);
    } catch (error) {
      this.logger.warn(`Could not resume turn timers: ${describeError(error)}`);
    }
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  // ─── Starting ─────────────────────────────────────────────────────────────

  /**
   * READY → STARTING → IN_PROGRESS in one transaction: deals with the secure shuffle, creates
   * the match, its players and the DEALT event. `requestedBy` must be the host; null means
   * the system (quick match).
   */
  async start(roomId: string, requestedBy: string | null): Promise<void> {
    const committed = await this.prisma.$transaction(async (tx) => {
      if (!(await lockRoom(tx, roomId))) {
        throw new AppException('ROOM_NOT_FOUND', HttpStatus.NOT_FOUND);
      }
      const room = await tx.room.findUniqueOrThrow({
        where: { id: roomId },
        include: { players: { orderBy: { seatIndex: 'asc' } } },
      });
      if (requestedBy !== null && room.hostId !== requestedBy) {
        throw new AppException('FORBIDDEN', HttpStatus.FORBIDDEN);
      }
      if (room.status === 'IN_PROGRESS' || room.status === 'STARTING') {
        throw new AppException('ROOM_ALREADY_STARTED', HttpStatus.CONFLICT);
      }
      if (room.status !== 'READY') throw new AppException('ROOM_NOT_READY', HttpStatus.CONFLICT);
      assertTransition(ROOM_TRANSITIONS, room.status, 'STARTING');
      assertTransition(ROOM_TRANSITIONS, 'STARTING', 'IN_PROGRESS');
      // Created, dealt and playing within this transaction.
      assertTransition(MATCH_TRANSITIONS, 'CREATED', 'DEALING');
      assertTransition(MATCH_TRANSITIONS, 'DEALING', 'PLAYING');

      const rules = await this.presets.rulesFor(room.ruleConfigId);
      const hands = this.dealer.deal();
      const { state, events } = startMatch(hands, rules);
      const now = new Date();
      const deadline =
        state.status === 'PLAYING' ? new Date(now.getTime() + room.turnTimerSeconds * 1000) : null;

      const match = await tx.match.create({
        data: {
          roomId,
          status: 'PLAYING',
          entryFee: room.entryFee,
          ruleSnapshot: rules,
          stateVersion: state.version,
          stateSnapshot: this.snapshot(state, deadline),
          startedAt: now,
          players: {
            create: room.players.map((p) => ({ userId: p.userId, seatIndex: p.seatIndex })),
          },
          events: {
            create: {
              sequence: 0,
              type: 'DEALT',
              // The full deal stays server-side (audit and replay); it is never sent to clients.
              payload: { hands: state.hands, openingSeat: state.turnSeat },
            },
          },
        },
        include: { players: true },
      });
      await tx.room.update({ where: { id: roomId }, data: { status: 'IN_PROGRESS' } });
      await this.writeEvents(tx, match.id, 1, events, null, null);
      if (state.status === 'FINISHED') await this.finalize(tx, match.id, roomId, state);

      return {
        matchId: match.id,
        roomId,
        stateVersion: state.version,
        playerIds: match.players.map((p) => p.userId),
        finished: state.status === 'FINISHED',
        deadline,
      } satisfies Committed;
    });
    this.afterCommit(committed, true);
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  play(roomId: string, userId: string, request: PlayCardsRequest): Promise<PlayerGameView> {
    return this.act(roomId, userId, request, (state, seat) =>
      applyPlay(state, seat, request.cards),
    );
  }

  pass(roomId: string, userId: string, request: PassRequest): Promise<PlayerGameView> {
    return this.act(roomId, userId, request, applyPass);
  }

  private async act(
    roomId: string,
    userId: string,
    { actionId, stateVersion }: { actionId: string; stateVersion: number },
    apply: (state: MatchState, seat: number) => ActionResult,
  ): Promise<PlayerGameView> {
    const matchId = await this.latestMatchId(roomId);
    const committed = await this.prisma.$transaction(async (tx) => {
      await lockMatch(tx, matchId);
      const match = await tx.match.findUniqueOrThrow({
        where: { id: matchId },
        include: { players: true, room: { select: { turnTimerSeconds: true } } },
      });
      const me = match.players.find((p) => p.userId === userId);
      if (!me) throw new AppException('FORBIDDEN', HttpStatus.FORBIDDEN);
      // A retried action is answered with the current state and changes nothing.
      const duplicate = await tx.matchEvent.findUnique({
        where: { matchId_actionId: { matchId, actionId } },
        select: { id: true },
      });
      if (duplicate) return null;
      if (match.status !== 'PLAYING') throw new AppException('MATCH_FINISHED', HttpStatus.CONFLICT);
      if (stateVersion !== match.stateVersion) {
        throw new AppException('STALE_STATE', HttpStatus.CONFLICT);
      }

      const { engine } = readSnapshot(match.stateSnapshot);
      const result = apply(engine, me.seatIndex);
      if (!result.ok) throw violationError(GAME_VIOLATION_ERROR_CODES[result.violation]);
      return this.persist(tx, match, result.state, result.events, userId, actionId);
    });
    if (committed) this.afterCommit(committed, false);
    return this.view(roomId, userId);
  }

  /**
   * Applies the timeout action (docs/GAME_RULES.md §13) if the match is still at
   * `expectedVersion` and its deadline has passed. Returns whether anything changed.
   */
  async expireTurn(matchId: string, expectedVersion: number, now = new Date()): Promise<boolean> {
    const committed = await this.prisma.$transaction(async (tx) => {
      if (!(await lockMatch(tx, matchId))) return null;
      const match = await tx.match.findUniqueOrThrow({
        where: { id: matchId },
        include: { players: true, room: { select: { turnTimerSeconds: true } } },
      });
      if (match.status !== 'PLAYING' || match.stateVersion !== expectedVersion) return null;
      const { engine, turnDeadline } = readSnapshot(match.stateSnapshot);
      if (!turnDeadline || new Date(turnDeadline) > now || engine.turnSeat === null) return null;

      const result = applyTimeout(engine, engine.turnSeat);
      if (!result.ok) throw new Error(`Timeout rejected by the engine: ${result.violation}`);
      return this.persist(tx, match, result.state, result.events, null, null);
    });
    if (!committed) return false;
    this.afterCommit(committed, false);
    return true;
  }

  // ─── Views ────────────────────────────────────────────────────────────────

  /** The caller's own view: their hand, and only counts for everyone else's. */
  async view(roomId: string, userId: string): Promise<PlayerGameView> {
    const match = await this.prisma.match.findFirst({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      include: viewInclude,
    });
    if (!match) throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
    const me = match.players.find((p) => p.userId === userId);
    if (!me) throw new AppException('FORBIDDEN', HttpStatus.FORBIDDEN);

    const { engine, turnDeadline } = readSnapshot(match.stateSnapshot);
    const finished = match.status !== 'PLAYING';
    const disconnected = new Set(
      match.room.players.filter((p) => p.disconnectedAt !== null).map((p) => p.userId),
    );
    return playerGameViewSchema.parse({
      matchId: match.id,
      roomId,
      status: match.status,
      stateVersion: match.stateVersion,
      entryFee: match.entryFee,
      mySeat: me.seatIndex,
      myHand: engine.hands[me.seatIndex],
      seats: match.players.map((p) => {
        const finishIndex = engine.finishOrder.indexOf(p.seatIndex);
        return {
          ...this.rooms.publicPlayer(p.user),
          seatIndex: p.seatIndex,
          cardCount: engine.hands[p.seatIndex]!.length,
          hasPassed: engine.passed[p.seatIndex],
          finishedPlace: finished ? p.placement : finishIndex === -1 ? null : finishIndex + 1,
          connected: !disconnected.has(p.userId),
        };
      }),
      currentTrick: engine.table
        ? { seatIndex: engine.table.seat, cards: engine.table.combination.cards }
        : null,
      turnSeat: finished ? null : engine.turnSeat,
      turnDeadline: finished ? null : turnDeadline,
      canPass: !finished && canPass(engine, me.seatIndex),
    });
  }

  async result(roomId: string, userId: string): Promise<MatchResult> {
    const match = await this.prisma.match.findFirst({
      where: { roomId, status: 'FINISHED' },
      orderBy: { createdAt: 'desc' },
      include: {
        players: { orderBy: { placement: 'asc' }, include: { user: { select: playerSelect } } },
      },
    });
    if (!match) throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
    if (!match.players.some((p) => p.userId === userId)) {
      throw new AppException('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return {
      matchId: match.id,
      placements: match.players.map((p) => ({
        ...this.rooms.publicPlayer(p.user),
        seatIndex: p.seatIndex,
        placement: p.placement!,
        cardsRemaining: p.cardsRemaining ?? 0,
        coinDelta: p.coinDelta ?? 0,
      })),
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private async latestMatchId(roomId: string): Promise<string> {
    const match = await this.prisma.match.findFirst({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!match) throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
    return match.id;
  }

  private snapshot(engine: MatchState, deadline: Date | null): Prisma.InputJsonValue {
    const snapshot: MatchSnapshot = {
      v: 1,
      engine,
      turnDeadline: deadline?.toISOString() ?? null,
    };
    return snapshot as unknown as Prisma.InputJsonValue;
  }

  /** Writes the new state and its events; finalizes the match when play has ended. */
  private async persist(
    tx: Prisma.TransactionClient,
    match: {
      id: string;
      roomId: string;
      players: { userId: string }[];
      room: { turnTimerSeconds: number };
    },
    state: MatchState,
    events: EngineEvent[],
    actorUserId: string | null,
    actionId: string | null,
  ): Promise<Committed> {
    const finished = state.status === 'FINISHED';
    const deadline = finished ? null : new Date(Date.now() + match.room.turnTimerSeconds * 1000);
    const last = await tx.matchEvent.aggregate({
      where: { matchId: match.id },
      _max: { sequence: true },
    });
    await this.writeEvents(
      tx,
      match.id,
      (last._max.sequence ?? -1) + 1,
      events,
      actorUserId,
      actionId,
    );
    await tx.match.update({
      where: { id: match.id },
      data: { stateVersion: state.version, stateSnapshot: this.snapshot(state, deadline) },
    });
    if (finished) await this.finalize(tx, match.id, match.roomId, state);
    return {
      matchId: match.id,
      roomId: match.roomId,
      stateVersion: state.version,
      playerIds: match.players.map((p) => p.userId),
      finished,
      deadline,
    };
  }

  /** The action's ID and actor go on its first event, so a retry finds it. */
  private async writeEvents(
    tx: Prisma.TransactionClient,
    matchId: string,
    firstSequence: number,
    events: EngineEvent[],
    actorUserId: string | null,
    actionId: string | null,
  ): Promise<void> {
    if (!events.length) return;
    await tx.matchEvent.createMany({
      data: events.map(({ type, ...payload }, i) => ({
        matchId,
        sequence: firstSequence + i,
        type,
        actorUserId: i === 0 ? actorUserId : null,
        actionId: i === 0 ? actionId : null,
        payload: payload as Prisma.InputJsonValue,
      })),
    });
  }

  /**
   * PLAYING → RESOLVING → FINISHED: stores placements and statistics, closes the room and
   * frees its seats. Rooms are free in this phase, so coinDelta is 0; Phase 6 settles paid
   * matches through the ledger here.
   */
  private async finalize(
    tx: Prisma.TransactionClient,
    matchId: string,
    roomId: string,
    state: MatchState,
  ): Promise<void> {
    assertTransition(MATCH_TRANSITIONS, 'PLAYING', 'RESOLVING');
    assertTransition(MATCH_TRANSITIONS, 'RESOLVING', 'FINISHED');
    assertTransition(ROOM_TRANSITIONS, 'IN_PROGRESS', 'FINISHED');
    const outcome = calculateMatchResult(state);
    const now = new Date();

    const players = await tx.matchPlayer.findMany({ where: { matchId } });
    const userAt = (seat: number) => players.find((p) => p.seatIndex === seat)!.userId;
    for (const placement of outcome.placements) {
      await tx.matchPlayer.update({
        where: { matchId_seatIndex: { matchId, seatIndex: placement.seat } },
        data: {
          status: 'FINISHED',
          placement: placement.placement,
          cardsRemaining: placement.remainingCards.length,
          coinDelta: 0,
        },
      });
    }
    await tx.match.update({
      where: { id: matchId },
      data: { status: 'FINISHED', finishedAt: now },
    });
    await tx.userProfile.updateMany({
      where: { userId: { in: players.map((p) => p.userId) } },
      data: { matchesPlayed: { increment: 1 } },
    });
    await tx.userProfile.update({
      where: { userId: userAt(outcome.winnerSeat) },
      data: { matchesWon: { increment: 1 } },
    });
    await tx.roomPlayer.deleteMany({ where: { roomId } });
    await tx.room.update({ where: { id: roomId }, data: { status: 'FINISHED', closedAt: now } });
  }

  private afterCommit(committed: Committed, roomChanged: boolean): void {
    const { matchId, roomId, stateVersion, playerIds, finished, deadline } = committed;
    if (finished) {
      clearTimeout(this.timers.get(matchId));
      this.timers.delete(matchId);
    } else if (deadline) {
      this.schedule(matchId, stateVersion, deadline);
    }
    this.realtime.gameUpdated({ roomId, matchId, stateVersion }, playerIds);
    if (roomChanged || finished) {
      this.realtime.roomUpdated(roomId, playerIds);
      this.realtime.roomsChanged();
    }
    if (finished) this.realtime.userUpdated(playerIds);
  }

  private schedule(matchId: string, version: number, deadline: Date): void {
    clearTimeout(this.timers.get(matchId));
    const delay = Math.max(0, deadline.getTime() - Date.now() + TURN_GRACE_MS);
    const timer = setTimeout(() => {
      this.timers.delete(matchId);
      this.expireTurn(matchId, version).catch((error: unknown) =>
        this.logger.error(`Turn timeout for match ${matchId} failed: ${describeError(error)}`),
      );
    }, delay);
    timer.unref();
    this.timers.set(matchId, timer);
  }
}
