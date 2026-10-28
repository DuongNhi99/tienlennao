/**
 * DEVELOPMENT-ONLY in-memory backend used by UI preview mode (see ./flag.ts).
 *
 * It mimics the server's authorization and state checks (membership, turn order, card
 * ownership, idempotency, stale versions) so the UI's error handling can be exercised, and every
 * response is validated against the shared contracts. It does NOT implement the Tiến Lên rules:
 * combinations are not validated (Phase 4), bots only play single cards, and the match ends when
 * the first player empties their hand. Shuffling uses Math.random — acceptable only here.
 */
import {
  ALL_CARD_IDS,
  type CardId,
  type CreateRoomRequest,
  createRoomRequestSchema,
  currentUserSummarySchema,
  dailyRewardStatusSchema,
  ERROR_MESSAGES_VI,
  type ErrorCode,
  type JoinRoomByCodeRequest,
  leaderboardEntrySchema,
  type MatchResult,
  matchResultSchema,
  type MatchmakingStatus,
  matchmakingStatusSchema,
  notificationItemSchema,
  type NotificationItem,
  PLAYERS_PER_MATCH,
  type PlayerGameView,
  playerGameViewSchema,
  type PublicPlayer,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type RoomDetail,
  roomDetailSchema,
  type RoomListFilter,
  type RoomOptions,
  roomOptionsSchema,
  type RoomStatus,
  type RoomSummary,
  roomSummarySchema,
  sortCards,
  compareCards,
  type TrickPlay,
} from '@tienlen/shared';
import type { DataSourceEvent, GameAction, GameDataSource } from '@/features/data-source/types';
import { ApiClientError } from '@/lib/api/client';

const LATENCY_MS = 200;
const BOT_DELAY_MS = 900;
const AUTO_START_DELAY_MS = 1200;
const MATCHMAKING_DELAY_MS = 2500;
const OPTIONS: RoomOptions = { entryFees: [0, 100, 500, 1000, 5000], turnTimers: [15, 30, 45] };

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

const ME: PublicPlayer = { userId: uuid(1), displayName: 'Minh Anh', avatarUrl: null };
const BOTS: PublicPlayer[] = [
  { userId: uuid(2), displayName: 'Hoàng Long', avatarUrl: null },
  { userId: uuid(3), displayName: 'Thu Trang', avatarUrl: null },
  { userId: uuid(4), displayName: 'Quốc Bảo', avatarUrl: null },
  { userId: uuid(5), displayName: 'Ngọc Hân', avatarUrl: null },
  { userId: uuid(6), displayName: 'Đức Huy', avatarUrl: null },
  { userId: uuid(7), displayName: 'Bảo Ngọc', avatarUrl: null },
  { userId: uuid(8), displayName: 'Thanh Tùng', avatarUrl: null },
];

interface MockSeat {
  player: PublicPlayer;
  isReady: boolean;
}

interface MockRoom {
  id: string;
  code: string;
  name: string | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  password: string | null;
  entryFee: number;
  turnTimerSeconds: number;
  hostId: string;
  status: RoomStatus;
  seats: (MockSeat | null)[];
  matchId: string | null;
}

interface MockGame {
  matchId: string;
  roomId: string;
  status: 'PLAYING' | 'FINISHED';
  stateVersion: number;
  players: PublicPlayer[];
  hands: CardId[][];
  currentTrick: TrickPlay | null;
  lastPlaySeat: number | null;
  passed: boolean[];
  finishedPlace: (number | null)[];
  turnSeat: number;
  turnDeadline: number;
  processedActions: Set<string>;
  result: MatchResult | null;
}

class ApiError extends ApiClientError {
  constructor(code: ErrorCode, status: number) {
    super(code, ERROR_MESSAGES_VI[code], status);
  }
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function randomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/** Start of the next Asia/Ho_Chi_Minh (UTC+7) day, as an ISO string. */
function nextVietnamMidnight(now: number): string {
  const offset = 7 * 3600_000;
  const day = 86_400_000;
  return new Date(Math.floor((now + offset) / day + 1) * day - offset).toISOString();
}

function seat(player: PublicPlayer, isReady = false): MockSeat {
  return { player, isReady };
}

function seedRooms(): MockRoom[] {
  const room = (
    n: number,
    fields: Partial<MockRoom> & Pick<MockRoom, 'seats' | 'hostId'>,
  ): MockRoom => ({
    id: uuid(0xa00 + n),
    code: ['K7M2QX', 'PHO3CU', 'B4N9ZT', 'FRND55', 'WKND88', 'TAPLUY'][n] ?? randomCode(),
    name: null,
    visibility: 'PUBLIC',
    password: null,
    entryFee: 0,
    turnTimerSeconds: 30,
    status: 'WAITING',
    matchId: null,
    ...fields,
  });
  const [long, trang, bao, han, huy, ngoc, tung] = BOTS as [
    PublicPlayer,
    PublicPlayer,
    PublicPlayer,
    PublicPlayer,
    PublicPlayer,
    PublicPlayer,
    PublicPlayer,
  ];
  return [
    room(0, {
      name: 'Bàn vui vẻ',
      hostId: long.userId,
      seats: [seat(long, true), seat(trang), null, null],
    }),
    room(1, {
      name: 'Cao thủ phố cổ',
      entryFee: 1000,
      hostId: bao.userId,
      seats: [seat(bao, true), seat(han, true), seat(huy), null],
    }),
    room(2, {
      entryFee: 100,
      status: 'IN_PROGRESS',
      hostId: ngoc.userId,
      seats: [seat(ngoc, true), seat(tung, true), seat(long, true), seat(trang, true)],
    }),
    room(3, {
      name: 'Phòng bạn bè',
      visibility: 'PRIVATE',
      password: 'banbe',
      entryFee: 500,
      hostId: huy.userId,
      seats: [seat(huy), null, null, null],
    }),
    room(4, {
      name: 'Giải trí cuối tuần',
      entryFee: 5000,
      status: 'READY',
      hostId: tung.userId,
      seats: [seat(tung, true), seat(ngoc, true), seat(bao, true), seat(han, true)],
    }),
    room(5, {
      name: 'Tập luyện',
      hostId: bao.userId,
      seats: [seat(bao, true), seat(han, true), seat(huy, true), null],
    }),
  ];
}

export function createPreviewDataSource(): GameDataSource {
  const listeners = new Set<(event: DataSourceEvent) => void>();
  const rooms = new Map<string, MockRoom>(seedRooms().map((r) => [r.id, r]));
  const games = new Map<string, MockGame>();
  const createRequests = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const now = Date.now();

  const user = {
    id: ME.userId,
    displayName: ME.displayName,
    avatarUrl: null,
    createdAt: '2026-03-14T09:30:00.000Z',
    balance: 12_500,
    matchesPlayed: 48,
    matchesWon: 15,
  };
  const daily = { claimable: true, streakDay: 3 };
  const matchmaking: {
    state: MatchmakingStatus['state'];
    entryFee: number | null;
    roomId: string | null;
  } = { state: 'IDLE', entryFee: null, roomId: null };
  const notifications: NotificationItem[] = [
    {
      id: uuid(0xb01),
      type: 'DAILY_REWARD',
      title: 'Phần thưởng hằng ngày',
      body: 'Phần thưởng ngày 3 của chuỗi đăng nhập đã sẵn sàng.',
      createdAt: new Date(now - 5 * 60_000).toISOString(),
      readAt: null,
    },
    {
      id: uuid(0xb02),
      type: 'MATCH_RESULT',
      title: 'Kết quả ván đấu',
      body: 'Bạn về nhất tại phòng “Bàn vui vẻ” và nhận +300 xu.',
      createdAt: new Date(now - 3 * 3600_000).toISOString(),
      readAt: new Date(now - 2 * 3600_000).toISOString(),
    },
    {
      id: uuid(0xb03),
      type: 'SECURITY',
      title: 'Đăng nhập mới',
      body: 'Tài khoản của bạn vừa đăng nhập trên một thiết bị mới.',
      createdAt: new Date(now - 26 * 3600_000).toISOString(),
      readAt: new Date(now - 25 * 3600_000).toISOString(),
    },
  ];

  const emit = (event: DataSourceEvent) => listeners.forEach((listener) => listener(event));

  function schedule(key: string, ms: number, fn: () => void) {
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        fn();
      }, ms),
    );
  }

  // ─── Rooms ───────────────────────────────────────────────────────────────

  function getRoomOrThrow(roomId: string): MockRoom {
    const room = rooms.get(roomId);
    if (!room) throw new ApiError('ROOM_NOT_FOUND', 404);
    return room;
  }

  const mySeatIn = (room: MockRoom) => room.seats.findIndex((s) => s?.player.userId === ME.userId);
  const playerCount = (room: MockRoom) => room.seats.filter(Boolean).length;
  const currentRoom = () => [...rooms.values()].find((r) => mySeatIn(r) !== -1 && isOpen(r));
  const isOpen = (room: MockRoom) => !['FINISHED', 'CANCELLED', 'EXPIRED'].includes(room.status);

  function refreshReadiness(room: MockRoom) {
    if (room.status !== 'WAITING' && room.status !== 'READY') return;
    const full = playerCount(room) === PLAYERS_PER_MATCH;
    room.status = full && room.seats.every((s) => s?.isReady) ? 'READY' : 'WAITING';
    // Bot hosts start automatically once everyone is ready.
    if (room.status === 'READY' && room.hostId !== ME.userId) {
      schedule(`autostart:${room.id}`, AUTO_START_DELAY_MS, () => {
        if (room.status === 'READY') {
          startGame(room);
          emit({ type: 'room', roomId: room.id });
          emit({ type: 'rooms' });
        }
      });
    }
  }

  function toSummary(room: MockRoom): RoomSummary {
    return roomSummarySchema.parse({
      id: room.id,
      code: room.code,
      name: room.name,
      visibility: room.visibility,
      hasPassword: room.password !== null,
      entryFee: room.entryFee,
      playerCount: playerCount(room),
      maxPlayers: PLAYERS_PER_MATCH,
      status: room.status,
    });
  }

  function toDetail(room: MockRoom): RoomDetail {
    const mySeat = mySeatIn(room);
    if (room.visibility === 'PRIVATE' && mySeat === -1) throw new ApiError('FORBIDDEN', 403);
    return roomDetailSchema.parse({
      ...toSummary(room),
      hostId: room.hostId,
      turnTimerSeconds: room.turnTimerSeconds,
      mySeat: mySeat === -1 ? null : mySeat,
      matchId: room.matchId,
      seats: room.seats.map((s, seatIndex) => ({
        seatIndex,
        player: s
          ? {
              ...s.player,
              isReady: s.isReady,
              isHost: s.player.userId === room.hostId,
              connected: true,
            }
          : null,
      })),
    });
  }

  function join(room: MockRoom, password?: string): { roomId: string } {
    if (mySeatIn(room) !== -1) return { roomId: room.id };
    if (currentRoom()) throw new ApiError('ALREADY_IN_ROOM', 409);
    if (room.status !== 'WAITING' && room.status !== 'READY') {
      throw new ApiError('ROOM_ALREADY_STARTED', 409);
    }
    const free = room.seats.findIndex((s) => s === null);
    if (free === -1) throw new ApiError('ROOM_FULL', 409);
    if (room.password !== null && room.password !== password) {
      throw new ApiError('INVALID_ROOM_PASSWORD', 403);
    }
    if (user.balance < room.entryFee) throw new ApiError('INSUFFICIENT_COINS', 409);
    room.seats[free] = seat(ME);
    refreshReadiness(room);
    emit({ type: 'room', roomId: room.id });
    emit({ type: 'rooms' });
    return { roomId: room.id };
  }

  // ─── Game ────────────────────────────────────────────────────────────────

  function startGame(room: MockRoom) {
    const players = room.seats.map((s) => s!.player);
    const deck = shuffled(ALL_CARD_IDS);
    const hands = players.map((_, i) => deck.slice(i * 13, i * 13 + 13));
    const game: MockGame = {
      matchId: crypto.randomUUID(),
      roomId: room.id,
      status: 'PLAYING',
      stateVersion: 1,
      players,
      hands,
      currentTrick: null,
      lastPlaySeat: null,
      passed: [false, false, false, false],
      finishedPlace: [null, null, null, null],
      // The holder of 3♠ leads the first trick.
      turnSeat: hands.findIndex((hand) => hand.includes('3S')),
      turnDeadline: 0,
      processedActions: new Set(),
      result: null,
    };
    if (players.some((p) => p.userId === ME.userId)) {
      user.balance -= room.entryFee;
      emit({ type: 'user' });
    }
    room.status = 'IN_PROGRESS';
    room.matchId = game.matchId;
    games.set(room.id, game);
    beginTurn(game);
  }

  const mySeatInGame = (game: MockGame) => game.players.findIndex((p) => p.userId === ME.userId);

  function beginTurn(game: MockGame) {
    const room = rooms.get(game.roomId)!;
    game.turnDeadline = Date.now() + room.turnTimerSeconds * 1000;
    const key = `turn:${game.matchId}`;
    const version = game.stateVersion;
    if (game.players[game.turnSeat]!.userId === ME.userId) {
      // Timeout policy (preview): auto-pass, or auto-play the lowest card when leading.
      schedule(key, room.turnTimerSeconds * 1000, () => {
        if (game.stateVersion !== version || game.status !== 'PLAYING') return;
        if (game.currentTrick) applyPass(game, game.turnSeat);
        else applyPlay(game, game.turnSeat, [sortCards(game.hands[game.turnSeat]!)[0]!]);
      });
    } else {
      schedule(key, BOT_DELAY_MS, () => {
        if (game.stateVersion !== version || game.status !== 'PLAYING') return;
        botMove(game);
      });
    }
  }

  function botMove(game: MockGame) {
    const seatIndex = game.turnSeat;
    const hand = sortCards(game.hands[seatIndex]!);
    const trick = game.currentTrick;
    if (!trick) {
      applyPlay(game, seatIndex, [hand[0]!]);
      return;
    }
    const target = trick.cards.length === 1 ? trick.cards[0]! : null;
    const beating = target ? hand.find((card) => compareCards(card, target) > 0) : undefined;
    if (beating) applyPlay(game, seatIndex, [beating]);
    else applyPass(game, seatIndex);
  }

  function applyPlay(game: MockGame, seatIndex: number, cards: CardId[]) {
    game.hands[seatIndex] = game.hands[seatIndex]!.filter((card) => !cards.includes(card));
    game.currentTrick = { seatIndex, cards };
    game.lastPlaySeat = seatIndex;
    game.passed = [false, false, false, false];
    if (game.hands[seatIndex]!.length === 0) {
      finishGame(game, seatIndex);
      return;
    }
    advanceTurn(game);
  }

  function applyPass(game: MockGame, seatIndex: number) {
    game.passed[seatIndex] = true;
    advanceTurn(game);
  }

  function advanceTurn(game: MockGame) {
    const contenders = [0, 1, 2, 3].filter(
      (s) => game.finishedPlace[s] === null && !game.passed[s] && s !== game.lastPlaySeat,
    );
    if (contenders.length === 0 && game.lastPlaySeat !== null) {
      // Everyone else passed: the last player wins the trick and leads the next one.
      game.currentTrick = null;
      game.passed = [false, false, false, false];
      game.turnSeat = game.lastPlaySeat;
    } else {
      for (let i = 1; i <= PLAYERS_PER_MATCH; i++) {
        const next = (game.turnSeat + i) % PLAYERS_PER_MATCH;
        if (contenders.includes(next)) {
          game.turnSeat = next;
          break;
        }
      }
    }
    game.stateVersion++;
    beginTurn(game);
    emit({ type: 'game', roomId: game.roomId });
  }

  function finishGame(game: MockGame, winnerSeat: number) {
    clearTimeout(timers.get(`turn:${game.matchId}`));
    const room = rooms.get(game.roomId)!;
    const order = [0, 1, 2, 3].sort((a, b) =>
      a === winnerSeat
        ? -1
        : b === winnerSeat
          ? 1
          : game.hands[a]!.length - game.hands[b]!.length || a - b,
    );
    // Preview payout table (the real table is defined in Phase 6): 50/30/20/0 % of the pool.
    const pool = room.entryFee * PLAYERS_PER_MATCH;
    const shares = [0.5, 0.3, 0.2, 0];
    const placements = order.map((seatIndex, i) => {
      const payout = Math.floor(pool * shares[i]!);
      return {
        ...game.players[seatIndex]!,
        seatIndex,
        placement: i + 1,
        cardsRemaining: game.hands[seatIndex]!.length,
        coinDelta: payout - room.entryFee,
      };
    });
    order.forEach((seatIndex, i) => (game.finishedPlace[seatIndex] = i + 1));
    game.status = 'FINISHED';
    game.stateVersion++;
    game.result = matchResultSchema.parse({ matchId: game.matchId, placements });
    room.status = 'FINISHED';

    const mine = placements.find((p) => p.userId === ME.userId);
    if (mine) {
      user.balance += mine.coinDelta + room.entryFee;
      user.matchesPlayed++;
      if (mine.placement === 1) user.matchesWon++;
      emit({ type: 'user' });
    }
    emit({ type: 'game', roomId: game.roomId });
    emit({ type: 'room', roomId: game.roomId });
    emit({ type: 'rooms' });
  }

  function getGameOrThrow(roomId: string): MockGame {
    const game = games.get(roomId);
    if (!game) throw new ApiError('NOT_FOUND', 404);
    if (mySeatInGame(game) === -1) throw new ApiError('FORBIDDEN', 403);
    return game;
  }

  function toView(game: MockGame): PlayerGameView {
    const mySeat = mySeatInGame(game);
    const room = rooms.get(game.roomId)!;
    return playerGameViewSchema.parse({
      matchId: game.matchId,
      roomId: game.roomId,
      status: game.status,
      stateVersion: game.stateVersion,
      entryFee: room.entryFee,
      mySeat,
      // Only this player's own cards are ever included.
      myHand: game.hands[mySeat],
      seats: game.players.map((player, seatIndex) => ({
        ...player,
        seatIndex,
        cardCount: game.hands[seatIndex]!.length,
        hasPassed: game.passed[seatIndex],
        finishedPlace: game.finishedPlace[seatIndex],
        connected: true,
      })),
      currentTrick: game.currentTrick,
      turnSeat: game.status === 'PLAYING' ? game.turnSeat : null,
      turnDeadline: game.status === 'PLAYING' ? new Date(game.turnDeadline).toISOString() : null,
      canPass: game.status === 'PLAYING' && game.turnSeat === mySeat && game.currentTrick !== null,
    });
  }

  function checkAction(game: MockGame, action: GameAction): 'duplicate' | 'ok' {
    if (game.processedActions.has(action.actionId)) return 'duplicate';
    if (game.status !== 'PLAYING') throw new ApiError('MATCH_FINISHED', 409);
    if (action.stateVersion !== game.stateVersion) throw new ApiError('STALE_STATE', 409);
    if (game.turnSeat !== mySeatInGame(game)) throw new ApiError('NOT_YOUR_TURN', 409);
    return 'ok';
  }

  // ─── Data source ─────────────────────────────────────────────────────────

  return {
    kind: 'preview',

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async getCurrentUser() {
      await delay(LATENCY_MS);
      return currentUserSummarySchema.parse(user);
    },

    async listRooms(filter: RoomListFilter) {
      await delay(LATENCY_MS);
      return [...rooms.values()]
        .filter(isOpen)
        .filter((r) => filter.maxEntryFee === undefined || r.entryFee <= filter.maxEntryFee)
        .filter(
          (r) =>
            !filter.onlyWithSeats || (r.status === 'WAITING' && playerCount(r) < PLAYERS_PER_MATCH),
        )
        .sort((a, b) => Number(a.status !== 'WAITING') - Number(b.status !== 'WAITING'))
        .map(toSummary);
    },

    async getRoomOptions() {
      await delay(LATENCY_MS);
      return roomOptionsSchema.parse(OPTIONS);
    },

    async createRoom(input: CreateRoomRequest) {
      await delay(LATENCY_MS);
      const request = createRoomRequestSchema.parse(input);
      const existing = createRequests.get(request.requestId);
      if (existing) return { roomId: existing };
      if (currentRoom()) throw new ApiError('ALREADY_IN_ROOM', 409);
      if (
        !OPTIONS.entryFees.includes(request.entryFee) ||
        !OPTIONS.turnTimers.includes(request.turnTimerSeconds)
      ) {
        throw new ApiError('VALIDATION_ERROR', 400);
      }
      if (user.balance < request.entryFee) throw new ApiError('INSUFFICIENT_COINS', 409);
      const room: MockRoom = {
        id: crypto.randomUUID(),
        code: randomCode(),
        name: request.name ?? null,
        visibility: request.visibility,
        password: request.password ?? null,
        entryFee: request.entryFee,
        turnTimerSeconds: request.turnTimerSeconds,
        hostId: ME.userId,
        status: 'WAITING',
        seats: [seat(ME), null, null, null],
        matchId: null,
      };
      rooms.set(room.id, room);
      createRequests.set(request.requestId, room.id);
      emit({ type: 'rooms' });
      return { roomId: room.id };
    },

    async joinRoom(roomId, password) {
      await delay(LATENCY_MS);
      return join(getRoomOrThrow(roomId), password);
    },

    async joinRoomByCode(input: JoinRoomByCodeRequest) {
      await delay(LATENCY_MS);
      const room = [...rooms.values()].find((r) => r.code === input.code && isOpen(r));
      if (!room) throw new ApiError('ROOM_NOT_FOUND', 404);
      return join(room, input.password);
    },

    async getRoom(roomId) {
      await delay(LATENCY_MS);
      return toDetail(getRoomOrThrow(roomId));
    },

    async setReady(roomId, ready) {
      await delay(LATENCY_MS);
      const room = getRoomOrThrow(roomId);
      const mySeat = mySeatIn(room);
      if (mySeat === -1) throw new ApiError('FORBIDDEN', 403);
      if (room.status !== 'WAITING' && room.status !== 'READY') {
        throw new ApiError('ROOM_ALREADY_STARTED', 409);
      }
      room.seats[mySeat]!.isReady = ready;
      refreshReadiness(room);
      emit({ type: 'room', roomId });
      return toDetail(room);
    },

    async updateRoomSettings(roomId, settings) {
      await delay(LATENCY_MS);
      const room = getRoomOrThrow(roomId);
      if (room.hostId !== ME.userId) throw new ApiError('FORBIDDEN', 403);
      if (room.status !== 'WAITING' && room.status !== 'READY') {
        throw new ApiError('ROOM_ALREADY_STARTED', 409);
      }
      if (
        !OPTIONS.entryFees.includes(settings.entryFee) ||
        !OPTIONS.turnTimers.includes(settings.turnTimerSeconds)
      ) {
        throw new ApiError('VALIDATION_ERROR', 400);
      }
      room.entryFee = settings.entryFee;
      room.turnTimerSeconds = settings.turnTimerSeconds;
      // Changed terms invalidate everyone's readiness.
      room.seats.forEach((s) => s && (s.isReady = false));
      refreshReadiness(room);
      emit({ type: 'room', roomId });
      emit({ type: 'rooms' });
      return toDetail(room);
    },

    async startMatch(roomId) {
      await delay(LATENCY_MS);
      const room = getRoomOrThrow(roomId);
      if (room.hostId !== ME.userId) throw new ApiError('FORBIDDEN', 403);
      if (room.status !== 'READY') throw new ApiError('ROOM_NOT_READY', 409);
      if (user.balance < room.entryFee) throw new ApiError('INSUFFICIENT_COINS', 409);
      startGame(room);
      emit({ type: 'room', roomId });
      emit({ type: 'rooms' });
      return toDetail(room);
    },

    async leaveRoom(roomId) {
      await delay(LATENCY_MS);
      const room = getRoomOrThrow(roomId);
      const mySeat = mySeatIn(room);
      if (mySeat === -1) return;
      if (room.status === 'IN_PROGRESS' || room.status === 'STARTING') {
        throw new ApiError('ROOM_ALREADY_STARTED', 409);
      }
      if (room.status === 'FINISHED') {
        rooms.delete(roomId);
      } else {
        room.seats[mySeat] = null;
        const remaining = room.seats.filter(Boolean) as MockSeat[];
        if (remaining.length === 0) {
          rooms.delete(roomId);
        } else if (room.hostId === ME.userId) {
          room.hostId = remaining[0]!.player.userId;
        }
        refreshReadiness(room);
      }
      emit({ type: 'rooms' });
      emit({ type: 'room', roomId });
    },

    async getGameView(roomId) {
      await delay(LATENCY_MS / 2);
      return toView(getGameOrThrow(roomId));
    },

    async playCards({ cards, ...action }) {
      await delay(LATENCY_MS / 2);
      const game = getGameOrThrow(action.roomId);
      if (checkAction(game, action) === 'duplicate') return toView(game);
      const hand = game.hands[game.turnSeat]!;
      const unique = new Set(cards);
      if (
        cards.length === 0 ||
        unique.size !== cards.length ||
        cards.some((c) => !hand.includes(c))
      ) {
        throw new ApiError('INVALID_CARD_SELECTION', 400);
      }
      game.processedActions.add(action.actionId);
      applyPlay(game, game.turnSeat, cards);
      return toView(game);
    },

    async pass(action) {
      await delay(LATENCY_MS / 2);
      const game = getGameOrThrow(action.roomId);
      if (checkAction(game, action) === 'duplicate') return toView(game);
      if (game.currentTrick === null) throw new ApiError('PASS_NOT_ALLOWED', 409);
      game.processedActions.add(action.actionId);
      applyPass(game, game.turnSeat);
      return toView(game);
    },

    async getMatchResult(roomId) {
      await delay(LATENCY_MS);
      const game = getGameOrThrow(roomId);
      if (!game.result) throw new ApiError('NOT_FOUND', 404);
      return game.result;
    },

    async getMatchmakingStatus() {
      await delay(LATENCY_MS / 2);
      return matchmakingStatusSchema.parse(matchmaking);
    },

    async joinMatchmaking(entryFee) {
      await delay(LATENCY_MS);
      if (matchmaking.state === 'SEARCHING') return matchmakingStatusSchema.parse(matchmaking);
      if (currentRoom()) throw new ApiError('ALREADY_IN_ROOM', 409);
      if (!OPTIONS.entryFees.includes(entryFee)) throw new ApiError('VALIDATION_ERROR', 400);
      if (user.balance < entryFee) throw new ApiError('INSUFFICIENT_COINS', 409);
      Object.assign(matchmaking, { state: 'SEARCHING', entryFee, roomId: null });
      schedule('matchmaking', MATCHMAKING_DELAY_MS, () => {
        if (matchmaking.state !== 'SEARCHING') return;
        const [a, b, c] = shuffled(BOTS) as [PublicPlayer, PublicPlayer, PublicPlayer];
        const room: MockRoom = {
          id: crypto.randomUUID(),
          code: randomCode(),
          name: 'Ghép trận nhanh',
          visibility: 'PUBLIC',
          password: null,
          entryFee,
          turnTimerSeconds: 30,
          hostId: a.userId,
          status: 'WAITING',
          // Quick-match seats are reserved as ready; the bot host starts automatically.
          seats: [seat(a, true), seat(ME, true), seat(b, true), seat(c, true)],
          matchId: null,
        };
        rooms.set(room.id, room);
        refreshReadiness(room);
        Object.assign(matchmaking, { state: 'MATCHED', roomId: room.id });
        emit({ type: 'matchmaking' });
        emit({ type: 'rooms' });
      });
      return matchmakingStatusSchema.parse(matchmaking);
    },

    async cancelMatchmaking() {
      await delay(LATENCY_MS);
      clearTimeout(timers.get('matchmaking'));
      if (matchmaking.state === 'SEARCHING') {
        Object.assign(matchmaking, { state: 'IDLE', entryFee: null, roomId: null });
      }
      return matchmakingStatusSchema.parse(matchmaking);
    },

    async getLeaderboardPreview() {
      await delay(LATENCY_MS);
      const rows = [
        [BOTS[3]!, 212, 540],
        [BOTS[0]!, 198, 610],
        [BOTS[5]!, 175, 402],
        [BOTS[1]!, 160, 455],
        [BOTS[6]!, 151, 390],
      ] as const;
      return rows.map(([player, wins, matchesPlayed], i) =>
        leaderboardEntrySchema.parse({ ...player, rank: i + 1, wins, matchesPlayed }),
      );
    },

    async getDailyReward() {
      await delay(LATENCY_MS);
      return dailyRewardStatusSchema.parse({
        claimable: daily.claimable,
        streakDay: daily.streakDay,
        amount: daily.streakDay * 100,
        nextClaimAt: nextVietnamMidnight(Date.now()),
      });
    },

    async claimDailyReward() {
      await delay(LATENCY_MS);
      if (!daily.claimable) throw new ApiError('ACTION_ALREADY_PROCESSED', 409);
      const amount = daily.streakDay * 100;
      daily.claimable = false;
      user.balance += amount;
      emit({ type: 'user' });
      return { amount, balance: user.balance };
    },

    async listNotifications() {
      await delay(LATENCY_MS);
      return notifications.map((n) => notificationItemSchema.parse(n));
    },

    async markAllNotificationsRead() {
      await delay(LATENCY_MS);
      const readAt = new Date().toISOString();
      notifications.forEach((n) => (n.readAt ??= readAt));
      emit({ type: 'notifications' });
    },
  };
}
