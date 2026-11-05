import { z } from 'zod';
import { PLAYERS_PER_MATCH } from '../constants/game';
import { cardIdSchema } from '../game/cards';
import { COMBINATION_TYPES } from '../game/combinations';
import { gameRulesSchema } from '../game/rules';
import { chopResultSchema, leftoverPenaltySchema } from './game';
import { leaderboardEntrySchema, publicPlayerSchema } from './lobby';

const seatIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(PLAYERS_PER_MATCH - 1);

// ─── Match history (Phase 7) ────────────────────────────────────────────────

export const historyPlayerSchema = publicPlayerSchema.extend({
  seatIndex: seatIndexSchema,
  /** Null for aborted matches. */
  placement: z.number().int().min(1).max(PLAYERS_PER_MATCH).nullable(),
  cardsRemaining: z.number().int().min(0).nullable(),
  /** Net coins from the match (payout − fee), as settled in the ledger. Null if aborted. */
  coinDelta: z.number().int().nullable(),
  /** Place points minus penalties (docs/GAME_RULES.md §11a). Null if aborted or unknown. */
  roundScore: z.number().int().nullable().default(null),
  penaltyPoints: z.number().int().nonnegative().nullable().default(null),
});
export type HistoryPlayer = z.infer<typeof historyPlayerSchema>;

export const matchHistoryItemSchema = z.object({
  matchId: z.uuid(),
  roomId: z.uuid(),
  roomCode: z.string(),
  roomName: z.string().nullable(),
  status: z.enum(['FINISHED', 'ABORTED']),
  entryFee: z.number().int().nonnegative(),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  mySeat: seatIndexSchema,
  players: z.array(historyPlayerSchema),
  /** The multi-round series this match was a round of, if any. */
  seriesId: z.uuid().nullable().default(null),
  roundNumber: z.number().int().positive().nullable().default(null),
});
export type MatchHistoryItem = z.infer<typeof matchHistoryItemSchema>;

export const matchHistoryPageSchema = z.object({
  items: z.array(matchHistoryItemSchema),
  nextCursor: z.uuid().nullable(),
});
export type MatchHistoryPage = z.infer<typeof matchHistoryPageSchema>;

/** Public moves only: the deal (DEALT) is never part of a timeline. */
export const TIMELINE_EVENT_TYPES = [
  'PLAY',
  'PASS',
  'TURN_TIMEOUT',
  'TRICK_RESOLVED',
  'PLAYER_FINISHED',
  'MATCH_FINISHED',
  'MATCH_ABORTED',
  'PLAYER_DISCONNECTED',
  'PLAYER_RECONNECTED',
] as const;

export const timelineEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  type: z.enum(TIMELINE_EVENT_TYPES),
  at: z.iso.datetime(),
  /** The acting seat (for TRICK_RESOLVED and MATCH_FINISHED: the winner). */
  seatIndex: seatIndexSchema.nullable(),
  /** Cards played (PLAY only); played cards are public. */
  cards: z.array(cardIdSchema).nullable(),
  combinationType: z.enum(COMBINATION_TYPES).nullable(),
  /** The seat whose combination was beaten by a bomb, for chops. */
  choppedSeat: seatIndexSchema.nullable(),
  /** Finishing place, for PLAYER_FINISHED. */
  place: z.number().int().min(1).max(PLAYERS_PER_MATCH).nullable(),
  /** A chop played out of turn (`bombs.outOfTurn`). */
  outOfTurn: z.boolean().default(false),
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

/** What a player still held when a finished match ended, and what it cost them. */
export const historyLeftoverSchema = z.object({
  seatIndex: seatIndexSchema,
  remainingCards: z.array(cardIdSchema),
  penalties: z.array(leftoverPenaltySchema),
  penaltyPoints: z.number().int().nonnegative(),
});
export type HistoryLeftover = z.infer<typeof historyLeftoverSchema>;

export const matchHistoryDetailSchema = matchHistoryItemSchema.extend({
  timeline: z.array(timelineEventSchema),
  /** The rules the match was played by (its snapshot). Null when unknown. */
  rules: gameRulesSchema.nullable().default(null),
  /** One per player, for finished matches; empty for aborted ones. */
  leftovers: z.array(historyLeftoverSchema).default([]),
  chops: z.array(chopResultSchema).default([]),
});
export type MatchHistoryDetail = z.infer<typeof matchHistoryDetailSchema>;

export const cursorPageQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ─── Leaderboard (Phase 7) ──────────────────────────────────────────────────

/**
 * Leaderboard categories. All count finished rounds (matches) only:
 * points (sum of round scores), wins, win rate, rounds played, best winning streak, chops
 * made (best cutting performance) and the lowest average penalty per round.
 */
export const LEADERBOARD_METRICS = [
  'points',
  'wins',
  'winRate',
  'played',
  'bestStreak',
  'chops',
  'lowPenalty',
] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];
export const LEADERBOARD_PERIODS = ['today', 'week', 'month', 'all'] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

/** Rate-based boards (win rate, lowest penalty) need this many finished rounds in the period. */
export const WIN_RATE_MIN_MATCHES: Readonly<Record<LeaderboardPeriod, number>> = {
  today: 3,
  week: 5,
  month: 10,
  all: 10,
};

/** Boards ranked by a rate, which need a minimum number of rounds. */
export const RATE_METRICS: ReadonlySet<LeaderboardMetric> = new Set(['winRate', 'lowPenalty']);

export const leaderboardQuerySchema = z.object({
  metric: z.enum(LEADERBOARD_METRICS).default('wins'),
  period: z.enum(LEADERBOARD_PERIODS).default('week'),
  offset: z.coerce.number().int().min(0).max(1000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Filters by display name (case and accents ignored); ranks stay those of the full board. */
  search: z
    .string()
    .trim()
    .max(32)
    .transform((value) => value || undefined)
    .optional(),
});
/** What a client asks for (the query string is parsed by `leaderboardQuerySchema`). */
export interface LeaderboardQuery {
  metric?: LeaderboardMetric;
  period?: LeaderboardPeriod;
  offset?: number;
  limit?: number;
  search?: string;
}

export const leaderboardSchema = z.object({
  metric: z.enum(LEADERBOARD_METRICS),
  period: z.enum(LEADERBOARD_PERIODS),
  /** Start of the period (Monday 00:00 Vietnam time for `week`); null for all time. */
  since: z.iso.datetime().nullable(),
  minMatches: z.number().int().nonnegative(),
  entries: z.array(leaderboardEntrySchema),
  /** Total ranked players (matching `search`, when given), for paging. */
  total: z.number().int().nonnegative(),
  search: z.string().nullable().default(null),
  /** The caller's own row, when ranked. */
  me: leaderboardEntrySchema.nullable(),
  generatedAt: z.iso.datetime(),
});
export type Leaderboard = z.infer<typeof leaderboardSchema>;

// ─── Player reports (Phase 7) ───────────────────────────────────────────────

export const REPORT_REASONS = ['CHEATING', 'COLLUSION', 'ABUSIVE_CHAT', 'SPAM', 'OTHER'] as const;
export const REPORT_REASON_LABELS_VI: Readonly<Record<(typeof REPORT_REASONS)[number], string>> = {
  CHEATING: 'Gian lận',
  COLLUSION: 'Thông đồng',
  ABUSIVE_CHAT: 'Lời lẽ xúc phạm',
  SPAM: 'Spam',
  OTHER: 'Khác',
};

/** A player reports another player from a match they both played. */
export const createReportRequestSchema = z.object({
  matchId: z.uuid(),
  reportedUserId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  details: z
    .string()
    .trim()
    .max(1000, 'Nội dung tối đa 1000 ký tự.')
    .transform((value) => value || undefined)
    .optional(),
});
export type CreateReportRequest = z.infer<typeof createReportRequestSchema>;
