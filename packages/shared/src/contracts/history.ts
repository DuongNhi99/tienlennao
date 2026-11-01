import { z } from 'zod';
import { PLAYERS_PER_MATCH } from '../constants/game';
import { cardIdSchema } from '../game/cards';
import { COMBINATION_TYPES } from '../game/combinations';
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
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;

export const matchHistoryDetailSchema = matchHistoryItemSchema.extend({
  timeline: z.array(timelineEventSchema),
});
export type MatchHistoryDetail = z.infer<typeof matchHistoryDetailSchema>;

export const cursorPageQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ─── Leaderboard (Phase 7) ──────────────────────────────────────────────────

export const LEADERBOARD_METRICS = ['wins', 'winRate', 'played'] as const;
export type LeaderboardMetric = (typeof LEADERBOARD_METRICS)[number];
export const LEADERBOARD_PERIODS = ['week', 'all'] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

/** Win-rate rankings need this many finished matches in the period. */
export const WIN_RATE_MIN_MATCHES: Readonly<Record<LeaderboardPeriod, number>> = {
  week: 5,
  all: 10,
};

export const leaderboardQuerySchema = z.object({
  metric: z.enum(LEADERBOARD_METRICS).default('wins'),
  period: z.enum(LEADERBOARD_PERIODS).default('week'),
  offset: z.coerce.number().int().min(0).max(1000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
/** What a client asks for (the query string is parsed by `leaderboardQuerySchema`). */
export interface LeaderboardQuery {
  metric?: LeaderboardMetric;
  period?: LeaderboardPeriod;
  offset?: number;
  limit?: number;
}

export const leaderboardSchema = z.object({
  metric: z.enum(LEADERBOARD_METRICS),
  period: z.enum(LEADERBOARD_PERIODS),
  /** Start of the period (Monday 00:00 Vietnam time for `week`); null for all time. */
  since: z.iso.datetime().nullable(),
  minMatches: z.number().int().nonnegative(),
  entries: z.array(leaderboardEntrySchema),
  /** Total ranked players, for paging. */
  total: z.number().int().nonnegative(),
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
