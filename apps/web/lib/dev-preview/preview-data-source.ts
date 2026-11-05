/**
 * DEVELOPMENT-ONLY in-memory backend used by UI preview mode (see ./flag.ts).
 *
 * It mimics the server's authorization and state checks (membership, idempotency, stale
 * versions) and runs matches on the real rules engine (@tienlen/shared), so plays are judged
 * exactly as on the server and results carry real penalties, chops and timelines. Bots choose
 * among the engine's legal plays (`chooseBotMove`). Every response is validated against the
 * shared contracts. Shuffling uses Math.random — acceptable only here.
 */
import {
  type AchievementItem,
  achievementItemSchema,
  type GameRules,
  invitationListSchema,
  matchesSearch,
  type PlayerStatistics,
  playerStatisticsSchema,
  type ProfileVisibility,
  publicProfileSchema,
  type ActionResult,
  ALL_CARD_IDS,
  applyPass,
  applyPlay,
  applyTimeout,
  calculateMatchResult,
  calculatePayouts,
  canPass,
  type CardId,
  chooseBotMove,
  DEFAULT_GAME_RULES,
  detectInstantWin,
  GAME_VIOLATION_ERROR_CODES,
  type MatchState,
  startMatch,
  type TimelineEvent,
  toChopResults,
  toTimelineEvent,
  type CreateRoomInput,
  createRoomRequestSchema,
  currentRoomSchema,
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
  MIN_PLAYERS_PER_MATCH,
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
  scoreLeftoverHand,
  type LeaderboardQuery,
  leaderboardSchema,
  type MatchHistoryDetail,
  matchHistoryDetailSchema,
  matchHistoryPageSchema,
  notificationPageSchema,
  rankLeaderboard,
  RATE_METRICS,
  WIN_RATE_MIN_MATCHES,
  type WalletTransaction,
  type WalletTransactionType,
  walletSummarySchema,
  walletTransactionPageSchema,
} from '@tienlen/shared';
import type { DataSourceEvent, GameAction, GameDataSource } from '@/features/data-source/types';
import { ApiClientError } from '@/lib/api/client';

const LATENCY_MS = 200;
const BOT_DELAY_MS = 900;
const AUTO_START_DELAY_MS = 1200;
const MATCHMAKING_DELAY_MS = 2500;
/** The standard rules; instant wins are re-dealt (see `startGame`). */
const PREVIEW_RULES = DEFAULT_GAME_RULES;
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
  rematchRoomId: string | null;
  rules: GameRules;
  /** Players the host removed; they cannot come back. */
  removed: string[];
}

interface MockGame {
  matchId: string;
  roomId: string;
  players: PublicPlayer[];
  /** The authoritative engine state, as the server stores it. */
  state: MatchState;
  timeline: TimelineEvent[];
  turnDeadline: number;
  processedActions: Set<string>;
  startedAt: number;
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
    rematchRoomId: null,
    rules: PREVIEW_RULES,
    removed: [],
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

/** Fixed statistics for the preview account (48 rounds, 15 wins), consistent with its summary. */
function previewStatistics(): PlayerStatistics {
  const placements = [15, 13, 11, 9];
  const weekly = Array.from({ length: 12 }, (_, i) => {
    const played = [2, 0, 3, 5, 4, 1, 6, 3, 7, 5, 8, 4][i]!;
    const won = Math.round(played * 0.3);
    return {
      weekStart: new Date(Date.UTC(2026, 7, 10 + i * 7) - 7 * 3600_000).toISOString(),
      played,
      won,
      score: won * 3 + (played - won),
      penaltyPoints: played > 3 ? 2 : 0,
    };
  });
  return playerStatisticsSchema.parse({
    roundsPlayed: 48,
    roundsWon: 15,
    winRate: 31.3,
    averagePlace: 2.3,
    placements: placements.map((count, i) => ({ place: i + 1, count })),
    lastPlaces: 9,
    cardsPlayed: 512,
    chopsMade: 7,
    twosChopped: 3,
    chopsReceived: 5,
    twosLeft: 6,
    penaltyPoints: 21,
    totalScore: 70,
    streaks: { currentWin: 1, bestWin: 3, currentLoss: 0, longestLoss: 5 },
    series: { played: 4, won: 1 },
    recent: BOTS.slice(0, 6).map((_, i) => ({
      matchId: uuid(0xd00 + i),
      finishedAt: new Date(Date.UTC(2026, 9, 30 - i, 12)).toISOString(),
      placement: [1, 3, 2, 4, 1, 2][i]!,
      players: 4,
      roundScore: [3, 1, 2, -2, 3, 2][i]!,
      penaltyPoints: [0, 0, 0, 2, 0, 0][i]!,
    })),
    weekly,
  });
}

function previewAchievements(): AchievementItem[] {
  return [
    [
      'FIRST_MATCH',
      'Ván đầu tiên',
      'Hoàn thành ván đấu đầu tiên.',
      200,
      '2026-03-14T10:00:00.000Z',
    ],
    ['PENALTY_FREE', 'Bét mà không thúi', 'Về bét ở bàn 3–4 người mà không bị phạt.', 200, null],
    ['COMEBACK', 'Lội ngược dòng', 'Về nhất ngay sau một ván về bét.', 300, null],
    [
      'FIRST_WIN',
      'Chiến thắng đầu tiên',
      'Về nhất trong một ván đấu.',
      500,
      '2026-03-15T20:00:00.000Z',
    ],
    ['PIG_HUNTER', 'Thợ săn heo', 'Chặt heo 5 lần.', 500, null],
    ['BOMB_MASTER', 'Bậc thầy bom', 'Chặt thành công 10 lần.', 800, null],
    [
      'TEN_MATCHES',
      'Người chơi chăm chỉ',
      'Hoàn thành 10 ván đấu.',
      1000,
      '2026-04-02T19:00:00.000Z',
    ],
    ['WIN_STREAK_5', 'Năm trận thắng liên tiếp', 'Về nhất 5 ván liên tiếp.', 1000, null],
  ].map(([code, name, description, rewardAmount, unlockedAt]) =>
    achievementItemSchema.parse({ code, name, description, rewardAmount, unlockedAt }),
  );
}

export function createPreviewDataSource(): GameDataSource {
  const listeners = new Set<(event: DataSourceEvent) => void>();
  const rooms = new Map<string, MockRoom>(seedRooms().map((r) => [r.id, r]));
  const games = new Map<string, MockGame>();
  const createRequests = new Map<string, string>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const now = Date.now();
  let profileVisibility: ProfileVisibility = 'PUBLIC';

  function profileOf(userId: string) {
    const player = userId === ME.userId ? ME : BOTS.find((b) => b.userId === userId);
    if (!player) throw new ApiError('NOT_FOUND', 404);
    const isMe = userId === ME.userId;
    const visible = isMe || profileVisibility === 'PUBLIC';
    return publicProfileSchema.parse({
      ...player,
      createdAt: '2026-03-14T09:30:00.000Z',
      visibility: isMe ? profileVisibility : 'PUBLIC',
      isMe,
      statistics: visible ? previewStatistics() : null,
      achievements: visible ? previewAchievements() : null,
    });
  }

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

  // Newest first: 10 000 → +200 → +2 100 → −100 → +300 ends at the starting 12 500.
  const ledger: WalletTransaction[] = (
    [
      ['MATCH_REWARD', 300, 12_500, 3],
      ['MATCH_ENTRY', -100, 12_200, 3.1],
      ['ACHIEVEMENT_REWARD', 2100, 12_300, 24],
      ['DAILY_REWARD', 200, 10_200, 26],
      ['INITIAL_BONUS', 10_000, 10_000, 24 * 30],
    ] as const
  ).map(([type, amount, balanceAfter, hoursAgo], i) => ({
    id: uuid(0xc00 + i),
    type,
    amount,
    balanceAfter,
    matchId: type.startsWith('MATCH') ? uuid(0xd00) : null,
    reason: null,
    createdAt: new Date(now - hoursAgo * 3600_000).toISOString(),
  }));
  const totals = { earned: 12_600, spent: 100 };

  /** Mirrors the server ledger: every balance change is one entry. */
  function record(type: WalletTransactionType, amount: number, matchId: string | null = null) {
    if (amount === 0) return;
    user.balance += amount;
    if (amount > 0) totals.earned += amount;
    else totals.spent -= amount;
    ledger.unshift({
      id: crypto.randomUUID(),
      type,
      amount,
      balanceAfter: user.balance,
      matchId,
      reason: null,
      createdAt: new Date().toISOString(),
    });
  }
  const [hl, ht, hb] = BOTS as [PublicPlayer, PublicPlayer, PublicPlayer];
  // Quốc Bảo finished last holding two 2s: thúi heo, scored by the engine.
  const lastHand: CardId[] = ['4H', '9C', '9D', '2S', '2D'];
  const history: MatchHistoryDetail[] = [
    matchHistoryDetailSchema.parse({
      matchId: uuid(0xd00),
      roomId: uuid(0xa00),
      roomCode: 'K7M2QX',
      roomName: 'Bàn vui vẻ',
      status: 'FINISHED',
      entryFee: 100,
      startedAt: new Date(now - 3.2 * 3600_000).toISOString(),
      finishedAt: new Date(now - 3 * 3600_000).toISOString(),
      durationSeconds: 720,
      mySeat: 0,
      players: [
        { ...ME, seatIndex: 0, placement: 1, cardsRemaining: 0, coinDelta: 100 },
        { ...hl, seatIndex: 1, placement: 3, cardsRemaining: 0, coinDelta: -20 },
        { ...ht, seatIndex: 2, placement: 2, cardsRemaining: 0, coinDelta: 20 },
        { ...hb, seatIndex: 3, placement: 4, cardsRemaining: 5, coinDelta: -100 },
      ],
      timeline: (
        [
          ['PLAY', 0, ['3S'], 'SINGLE', null],
          ['PLAY', 1, ['7D'], 'SINGLE', null],
          ['PASS', 2, null, null, null],
          ['PLAY', 3, ['2H'], 'SINGLE', null],
          ['TRICK_RESOLVED', 3, null, null, null],
          ['PLAYER_FINISHED', 0, null, null, 1],
          ['MATCH_FINISHED', 0, null, null, null],
        ] as const
      ).map(([type, seatIndex, cards, combinationType, place], sequence) => ({
        sequence: sequence + 1,
        type,
        at: new Date(now - 3.2 * 3600_000 + sequence * 60_000).toISOString(),
        seatIndex,
        cards: cards ? [...cards] : null,
        combinationType,
        choppedSeat: null,
        place,
      })),
      rules: PREVIEW_RULES,
      leftovers: [0, 1, 2, 3].map((seatIndex) => {
        const remainingCards = seatIndex === 3 ? lastHand : [];
        const penalties = scoreLeftoverHand(remainingCards, PREVIEW_RULES);
        const penaltyPoints = penalties.reduce((sum, item) => sum + item.points, 0);
        return { seatIndex, remainingCards, penalties, penaltyPoints };
      }),
    }),
  ];
  const leaderboardRows = (
    [
      [BOTS[3]!, 212, 540],
      [BOTS[0]!, 198, 610],
      [BOTS[5]!, 175, 402],
      [BOTS[1]!, 160, 455],
      [BOTS[6]!, 151, 390],
      [BOTS[2]!, 120, 260],
      [ME, 15, 48],
    ] as const
  ).map(([player, wins, played], i) => ({
    ...player,
    wins,
    played,
    // Plausible, fixed figures for the other boards.
    points: wins * 3 + Math.round((played - wins) * 0.8),
    bestStreak: [6, 5, 4, 4, 3, 3, 3][i]!,
    chops: [41, 37, 25, 30, 18, 12, 7][i]!,
    penaltyPoints: [380, 470, 300, 210, 350, 150, 21][i]!,
  }));
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
      link: '/lobby',
      createdAt: new Date(now - 5 * 60_000).toISOString(),
      readAt: null,
    },
    {
      id: uuid(0xb02),
      type: 'MATCH_RESULT',
      title: 'Kết quả ván đấu',
      body: 'Bạn về nhất tại phòng “Bàn vui vẻ” và nhận +200 xu.',
      link: `/history/${uuid(0xd00)}`,
      createdAt: new Date(now - 3 * 3600_000).toISOString(),
      readAt: new Date(now - 2 * 3600_000).toISOString(),
    },
    {
      id: uuid(0xb03),
      type: 'SECURITY',
      title: 'Đăng nhập mới',
      body: 'Tài khoản của bạn vừa đăng nhập trên một thiết bị mới.',
      link: null,
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
    const seated = room.seats.filter((s): s is MockSeat => s !== null);
    // As on the server: READY with at least two seated players, all of them ready.
    room.status =
      seated.length >= MIN_PLAYERS_PER_MATCH && seated.every((s) => s.isReady)
        ? 'READY'
        : 'WAITING';
    // Bot hosts wait for a full table, then start automatically.
    if (full && room.status === 'READY' && room.hostId !== ME.userId) {
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
      rules: room.rules,
      rematchRoomId: (() => {
        const next = room.rematchRoomId ? rooms.get(room.rematchRoomId) : undefined;
        return next && (next.status === 'WAITING' || next.status === 'READY') ? next.id : null;
      })(),
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
    // Instant wins are re-dealt so the practice table always plays, and you get the hand
    // with 3♠: the demo (and its browser tests) opens with your move.
    let hands: CardId[][];
    do {
      const deck = shuffled(ALL_CARD_IDS);
      hands = players.map((_, i) => deck.slice(i * 13, i * 13 + 13));
    } while (hands.some((hand) => detectInstantWin(hand, PREVIEW_RULES.instantWins)));
    const me = players.findIndex((p) => p.userId === ME.userId);
    const opener = hands.findIndex((hand) => hand.includes('3S'));
    if (me !== -1 && opener !== -1) [hands[me], hands[opener]] = [hands[opener]!, hands[me]!];

    const game: MockGame = {
      matchId: crypto.randomUUID(),
      roomId: room.id,
      players,
      state: startMatch(hands, room.rules).state,
      timeline: [],
      turnDeadline: 0,
      processedActions: new Set(),
      startedAt: Date.now(),
      result: null,
    };
    if (me !== -1) {
      record('MATCH_ENTRY', -room.entryFee, game.matchId);
      emit({ type: 'user' });
    }
    room.status = 'IN_PROGRESS';
    room.matchId = game.matchId;
    games.set(room.id, game);
    beginTurn(game);
  }

  const mySeatInGame = (game: MockGame) => game.players.findIndex((p) => p.userId === ME.userId);

  /** Applies an engine result, as the server does: reject, or store the state and its events. */
  function commit(game: MockGame, result: ActionResult) {
    if (!result.ok) {
      const code = GAME_VIOLATION_ERROR_CODES[result.violation];
      const status = code.startsWith('INVALID_') ? 400 : code === 'FORBIDDEN' ? 403 : 409;
      throw new ApiError(code, status);
    }
    game.state = result.state;
    for (const { type, ...payload } of result.events) {
      const sequence = game.timeline.length + 1;
      const event = toTimelineEvent({ sequence, type, createdAt: new Date(), payload });
      if (event) game.timeline.push(event);
    }
    if (game.state.status === 'FINISHED') finishGame(game);
    else beginTurn(game);
    emit({ type: 'game', roomId: game.roomId });
  }

  function beginTurn(game: MockGame) {
    const room = rooms.get(game.roomId)!;
    game.turnDeadline = Date.now() + room.turnTimerSeconds * 1000;
    const key = `turn:${game.matchId}`;
    const { version, turnSeat } = game.state;
    const seat = turnSeat!;
    const stillCurrent = () => game.state.version === version && game.state.status === 'PLAYING';
    if (game.players[seat]!.userId === ME.userId) {
      // The engine's timeout action: pass, or lead the weakest card.
      schedule(key, room.turnTimerSeconds * 1000, () => {
        if (stillCurrent()) commit(game, applyTimeout(game.state, seat));
      });
    } else {
      // Bots choose among the engine's legal plays (chooseBotMove).
      schedule(key, BOT_DELAY_MS, () => {
        if (!stillCurrent()) return;
        const move = chooseBotMove(game.state, seat);
        commit(
          game,
          move?.type === 'PLAY'
            ? applyPlay(game.state, seat, move.cards)
            : move?.type === 'PASS'
              ? applyPass(game.state, seat)
              : applyTimeout(game.state, seat),
        );
      });
    }
  }

  function finishGame(game: MockGame) {
    clearTimeout(timers.get(`turn:${game.matchId}`));
    const room = rooms.get(game.roomId)!;
    const outcome = calculateMatchResult(game.state);
    const payouts = calculatePayouts(room.entryFee, game.players.length);
    const placements = outcome.placements.map((p) => ({
      ...game.players[p.seat]!,
      seatIndex: p.seat,
      placement: p.placement,
      cardsRemaining: p.remainingCards.length,
      remainingCards: p.remainingCards,
      coinDelta: payouts[p.placement - 1]! - room.entryFee,
      penalties: p.penalties,
      penaltyPoints: p.penaltyPoints,
      roundScore: p.roundScore,
    }));
    const chops = toChopResults(outcome.chops);
    game.result = matchResultSchema.parse({
      matchId: game.matchId,
      placements,
      reason: outcome.reason,
      instantWinKind: outcome.instantWin?.kind ?? null,
      chops,
    });
    if (mySeatInGame(game) !== -1) {
      history.unshift({
        matchId: game.matchId,
        roomId: room.id,
        roomCode: room.code,
        roomName: room.name,
        status: 'FINISHED',
        entryFee: room.entryFee,
        startedAt: new Date(game.startedAt).toISOString(),
        finishedAt: new Date().toISOString(),
        durationSeconds: Math.round((Date.now() - game.startedAt) / 1000),
        mySeat: mySeatInGame(game),
        players: placements
          .map(
            ({
              seatIndex,
              placement,
              cardsRemaining,
              coinDelta,
              roundScore,
              penaltyPoints,
              ...p
            }) => ({
              userId: p.userId,
              displayName: p.displayName,
              avatarUrl: p.avatarUrl,
              seatIndex,
              placement,
              cardsRemaining,
              coinDelta,
              roundScore,
              penaltyPoints,
            }),
          )
          .sort((a, b) => a.seatIndex - b.seatIndex),
        seriesId: null,
        roundNumber: null,
        timeline: game.timeline,
        rules: game.state.rules,
        leftovers: placements
          .map(({ seatIndex, remainingCards, penalties, penaltyPoints }) => ({
            seatIndex,
            remainingCards,
            penalties,
            penaltyPoints,
          }))
          .sort((a, b) => a.seatIndex - b.seatIndex),
        chops,
      });
    }
    room.status = 'FINISHED';

    const mine = placements.find((p) => p.userId === ME.userId);
    if (mine) {
      record('MATCH_REWARD', mine.coinDelta + room.entryFee, game.matchId);
      user.matchesPlayed++;
      if (mine.placement === 1) user.matchesWon++;
      emit({ type: 'user' });
    }
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
    const { state } = game;
    const finished = state.status === 'FINISHED';
    const place = (seatIndex: number) => {
      if (game.result)
        return game.result.placements.find((p) => p.seatIndex === seatIndex)!.placement;
      const index = state.finishOrder.indexOf(seatIndex);
      return index === -1 ? null : index + 1;
    };
    return playerGameViewSchema.parse({
      matchId: game.matchId,
      roomId: game.roomId,
      status: state.status,
      stateVersion: state.version,
      entryFee: room.entryFee,
      mySeat,
      // Only this player's own cards are ever included.
      myHand: state.hands[mySeat],
      seats: game.players.map((player, seatIndex) => ({
        ...player,
        seatIndex,
        cardCount: state.hands[seatIndex]!.length,
        hasPassed: state.passed[seatIndex],
        finishedPlace: place(seatIndex),
        connected: true,
        revealedCards: finished ? state.hands[seatIndex] : null,
      })),
      currentTrick: state.table
        ? { seatIndex: state.table.seat, cards: state.table.combination.cards }
        : null,
      turnSeat: finished ? null : state.turnSeat,
      turnDeadline: finished ? null : new Date(game.turnDeadline).toISOString(),
      canPass: !finished && canPass(state, mySeat),
      rules: state.rules,
      openingCard: !finished && state.turnSeat === mySeat ? state.openingCard : null,
    });
  }

  /** Idempotency and versions, as on the server; turn order and legality are the engine's. */
  function checkAction(game: MockGame, action: GameAction): 'duplicate' | 'ok' {
    if (game.processedActions.has(action.actionId)) return 'duplicate';
    if (game.state.status !== 'PLAYING') throw new ApiError('MATCH_FINISHED', 409);
    if (action.stateVersion !== game.state.version) throw new ApiError('STALE_STATE', 409);
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
            !filter.onlyWithSeats ||
            ((r.status === 'WAITING' || r.status === 'READY') &&
              playerCount(r) < PLAYERS_PER_MATCH),
        )
        .sort((a, b) => Number(a.status !== 'WAITING') - Number(b.status !== 'WAITING'))
        .map(toSummary);
    },

    async getRoomOptions() {
      await delay(LATENCY_MS);
      return roomOptionsSchema.parse(OPTIONS);
    },

    async createRoom(input: CreateRoomInput) {
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
        rematchRoomId: null,
        rules: request.rules ?? PREVIEW_RULES,
        removed: [],
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

    async getCurrentRoom() {
      await delay(LATENCY_MS / 2);
      const room = currentRoom();
      return currentRoomSchema.parse({ room: room ? toSummary(room) : null });
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
      if (settings.rules) room.rules = settings.rules as GameRules;
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

    async rematch(roomId) {
      await delay(LATENCY_MS);
      const previous = getRoomOrThrow(roomId);
      const game = games.get(roomId);
      if (!game || mySeatInGame(game) === -1) throw new ApiError('FORBIDDEN', 403);
      if (previous.status !== 'FINISHED') throw new ApiError('ROOM_ALREADY_STARTED', 409);
      const linked = previous.rematchRoomId ? rooms.get(previous.rematchRoomId) : undefined;
      if (linked && mySeatIn(linked) !== -1) return { roomId: linked.id };
      if (currentRoom()) throw new ApiError('ALREADY_IN_ROOM', 409);
      if (user.balance < previous.entryFee) throw new ApiError('INSUFFICIENT_COINS', 409);
      // As on the server, a new room on the same terms. The preview's bots always want another
      // round, so they are already seated and ready.
      const next: MockRoom = {
        ...previous,
        id: crypto.randomUUID(),
        code: randomCode(),
        hostId: ME.userId,
        status: 'WAITING',
        seats: game.players.map((p) => (p.userId === ME.userId ? seat(ME) : seat(p, true))),
        matchId: null,
        rematchRoomId: null,
        rules: PREVIEW_RULES,
        removed: [],
      };
      rooms.set(next.id, next);
      previous.rematchRoomId = next.id;
      refreshReadiness(next);
      emit({ type: 'room', roomId });
      emit({ type: 'rooms' });
      return { roomId: next.id };
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
      commit(game, applyPlay(game.state, mySeatInGame(game), cards));
      game.processedActions.add(action.actionId);
      return toView(game);
    },

    async pass(action) {
      await delay(LATENCY_MS / 2);
      const game = getGameOrThrow(action.roomId);
      if (checkAction(game, action) === 'duplicate') return toView(game);
      commit(game, applyPass(game.state, mySeatInGame(game)));
      game.processedActions.add(action.actionId);
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
          rematchRoomId: null,
          rules: PREVIEW_RULES,
          removed: [],
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
      return (await this.getLeaderboard({ metric: 'wins', period: 'week', limit: 5 })).entries;
    },

    async getLeaderboard({
      metric = 'wins',
      period = 'week',
      offset = 0,
      limit = 50,
      search,
    }: LeaderboardQuery) {
      await delay(LATENCY_MS);
      const minMatches = RATE_METRICS.has(metric) ? WIN_RATE_MIN_MATCHES[period] : 0;
      const ranked = rankLeaderboard(leaderboardRows, metric, minMatches).map((row) =>
        leaderboardEntrySchema.parse({
          ...leaderboardRows.find((r) => r.userId === row.userId)!,
          rank: row.rank,
          matchesPlayed: row.played,
          winRate: row.winRate,
          points: row.points,
          bestStreak: row.bestStreak,
          chops: row.chops,
          averagePenalty: row.averagePenalty,
        }),
      );
      const shown = search ? ranked.filter((e) => matchesSearch(e.displayName, search)) : ranked;
      return leaderboardSchema.parse({
        metric,
        period,
        since: period === 'week' ? new Date(now - 3 * 86_400_000).toISOString() : null,
        minMatches,
        entries: shown.slice(offset, offset + limit),
        total: shown.length,
        search: search ?? null,
        me: ranked.find((e) => e.userId === ME.userId) ?? null,
        generatedAt: new Date().toISOString(),
      });
    },

    async listMatchHistory(cursor?: string) {
      await delay(LATENCY_MS);
      const start = cursor ? history.findIndex((m) => m.matchId === cursor) + 1 : 0;
      const items = history
        .slice(start, start + 20)
        .map(({ timeline: _timeline, ...item }) => item);
      return matchHistoryPageSchema.parse({
        items,
        nextCursor: start + 20 < history.length ? items.at(-1)!.matchId : null,
      });
    },

    async getMatchHistory(matchId: string) {
      await delay(LATENCY_MS);
      const match = history.find((m) => m.matchId === matchId);
      if (!match) throw new ApiError('NOT_FOUND', 404);
      return matchHistoryDetailSchema.parse(match);
    },

    async reportPlayer() {
      await delay(LATENCY_MS);
      return { reportId: crypto.randomUUID() };
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

    async getWallet() {
      await delay(LATENCY_MS);
      return walletSummarySchema.parse({
        balance: user.balance,
        totalEarned: totals.earned,
        totalSpent: totals.spent,
      });
    },

    async listWalletTransactions(cursor?: string) {
      await delay(LATENCY_MS);
      const start = cursor ? ledger.findIndex((t) => t.id === cursor) + 1 : 0;
      const items = ledger.slice(start, start + 20);
      return walletTransactionPageSchema.parse({
        items,
        nextCursor: start + 20 < ledger.length ? items.at(-1)!.id : null,
      });
    },

    async claimDailyReward() {
      await delay(LATENCY_MS);
      if (!daily.claimable) throw new ApiError('ACTION_ALREADY_PROCESSED', 409);
      const amount = daily.streakDay * 100;
      daily.claimable = false;
      record('DAILY_REWARD', amount);
      emit({ type: 'user' });
      return { amount, balance: user.balance };
    },

    async listNotifications() {
      await delay(LATENCY_MS);
      return notificationPageSchema.parse({
        items: notifications.map((n) => notificationItemSchema.parse(n)),
        nextCursor: null,
        unreadCount: notifications.filter((n) => n.readAt === null).length,
      });
    },

    async markNotificationRead(id: string) {
      await delay(LATENCY_MS);
      const item = notifications.find((n) => n.id === id);
      if (!item) throw new ApiError('NOT_FOUND', 404);
      item.readAt ??= new Date().toISOString();
      emit({ type: 'notifications' });
    },

    async markAllNotificationsRead() {
      await delay(LATENCY_MS);
      const readAt = new Date().toISOString();
      notifications.forEach((n) => (n.readAt ??= readAt));
      emit({ type: 'notifications' });
    },
    async removeMember(roomId: string, userId: string) {
      await delay(LATENCY_MS);
      const room = getRoomOrThrow(roomId);
      if (room.hostId !== ME.userId) throw new ApiError('FORBIDDEN', 403);
      if (room.status !== 'WAITING' && room.status !== 'READY') {
        throw new ApiError('ROOM_ALREADY_STARTED', 409);
      }
      const index = room.seats.findIndex((s) => s?.player.userId === userId);
      if (index === -1 || userId === ME.userId) throw new ApiError('NOT_FOUND', 404);
      room.seats[index] = null;
      room.removed.push(userId);
      refreshReadiness(room);
      emit({ type: 'room', roomId });
      emit({ type: 'rooms' });
      return toDetail(room);
    },

    async closeRoom(roomId: string) {
      await delay(LATENCY_MS);
      const room = getRoomOrThrow(roomId);
      if (room.hostId !== ME.userId) throw new ApiError('FORBIDDEN', 403);
      if (room.status !== 'WAITING' && room.status !== 'READY') {
        throw new ApiError('ROOM_ALREADY_STARTED', 409);
      }
      room.status = 'CANCELLED';
      room.seats = room.seats.map(() => null);
      emit({ type: 'room', roomId });
      emit({ type: 'rooms' });
    },

    // Spectating, invitations and series need several real accounts: not simulated here.
    async spectate() {
      await delay(LATENCY_MS);
      throw new ApiError('FEATURE_UNAVAILABLE', 501);
    },
    async spectateByCode() {
      await delay(LATENCY_MS);
      throw new ApiError('FEATURE_UNAVAILABLE', 501);
    },
    async stopSpectating() {
      await delay(LATENCY_MS);
    },
    async getSpectatorView() {
      await delay(LATENCY_MS);
      throw new ApiError('FORBIDDEN', 403);
    },
    async getGameEvents(roomId: string, after = -1) {
      await delay(LATENCY_MS);
      const game = [...games.values()].find((g) => g.roomId === roomId);
      if (!game) throw new ApiError('NOT_FOUND', 404);
      return game.timeline.filter((e) => e.sequence > after);
    },
    async createInvitation() {
      await delay(LATENCY_MS);
      throw new ApiError('FEATURE_UNAVAILABLE', 501);
    },
    async listRoomInvitations() {
      await delay(LATENCY_MS);
      return invitationListSchema.parse({ items: [] });
    },
    async listInvitations() {
      await delay(LATENCY_MS);
      return invitationListSchema.parse({ items: [] });
    },
    async acceptInvitation() {
      await delay(LATENCY_MS);
      throw new ApiError('NOT_FOUND', 404);
    },
    async rejectInvitation() {
      await delay(LATENCY_MS);
      throw new ApiError('NOT_FOUND', 404);
    },
    async cancelInvitation() {
      await delay(LATENCY_MS);
      throw new ApiError('NOT_FOUND', 404);
    },
    async previewInvitationLink() {
      await delay(LATENCY_MS);
      throw new ApiError('INVALID_TOKEN', 404);
    },
    async acceptInvitationLink() {
      await delay(LATENCY_MS);
      throw new ApiError('INVALID_TOKEN', 404);
    },
    async searchPlayers(query: string) {
      await delay(LATENCY_MS);
      return BOTS.filter((bot) => matchesSearch(bot.displayName, query)).slice(0, 10);
    },
    async getSeries() {
      await delay(LATENCY_MS);
      throw new ApiError('NOT_FOUND', 404);
    },
    async finishSeries() {
      await delay(LATENCY_MS);
      throw new ApiError('NOT_FOUND', 404);
    },
    async getMyStatistics() {
      await delay(LATENCY_MS);
      return previewStatistics();
    },
    async getMyAchievements() {
      await delay(LATENCY_MS);
      return previewAchievements();
    },
    async getProfile(userId: string) {
      await delay(LATENCY_MS);
      return profileOf(userId);
    },
    async setProfileVisibility(visibility: ProfileVisibility) {
      await delay(LATENCY_MS);
      profileVisibility = visibility;
      return profileOf(ME.userId);
    },
  };
}
