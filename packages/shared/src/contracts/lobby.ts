import { z } from 'zod';
import { PLAYERS_PER_MATCH } from '../constants/game';
import { ROOM_STATUSES } from '../constants/lifecycle';
import { gameRulesSchema } from '../game/rules';
import { roomVisibilitySchema, SERIES_END_CONDITIONS } from '../schemas/rooms';

/**
 * Read models for the lobby, waiting room, and player summaries. Draft v0: the UI is built
 * against these in Phase 2; the server endpoints (Phases 3, 5–7) must return these shapes.
 */

const seatIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(PLAYERS_PER_MATCH - 1);
const coinsSchema = z.number().int();

export const roomStatusSchema = z.enum(ROOM_STATUSES);

/** Public identity of another player. Never includes email or other private data. */
export const publicPlayerSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export type PublicPlayer = z.infer<typeof publicPlayerSchema>;

export const currentUserSummarySchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
  balance: coinsSchema.nonnegative(),
  matchesPlayed: z.number().int().nonnegative(),
  matchesWon: z.number().int().nonnegative(),
});
export type CurrentUserSummary = z.infer<typeof currentUserSummarySchema>;

export const roomSummarySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string().nullable(),
  visibility: roomVisibilitySchema,
  hasPassword: z.boolean(),
  entryFee: coinsSchema.nonnegative(),
  playerCount: z.number().int().min(0).max(PLAYERS_PER_MATCH),
  maxPlayers: z.number().int(),
  status: roomStatusSchema,
  /** The fields below are optional so the web app keeps working with an older API. */
  allowSpectators: z.boolean().default(false),
  spectatorCount: z.number().int().nonnegative().default(0),
  /** The round this room plays when it belongs to a multi-round series. */
  roundNumber: z.number().int().positive().nullable().default(null),
});
export type RoomSummary = z.infer<typeof roomSummarySchema>;

export const seriesStatusSchema = z.enum(['IN_PROGRESS', 'FINISHED', 'CANCELLED']);

/** A player's cumulative result in a series (docs/GAME_RULES.md §20). */
export const seriesStandingSchema = publicPlayerSchema.extend({
  /** 1-based; players with equal totals, round wins and best place share a rank. */
  rank: z.number().int().positive(),
  totalScore: z.number().int(),
  roundsPlayed: z.number().int().nonnegative(),
  roundsWon: z.number().int().nonnegative(),
  penaltyPoints: z.number().int().nonnegative(),
});
export type SeriesStanding = z.infer<typeof seriesStandingSchema>;

export const seriesSummarySchema = z.object({
  id: z.uuid(),
  hostId: z.uuid(),
  status: seriesStatusSchema,
  endCondition: z.enum(SERIES_END_CONDITIONS),
  targetRounds: z.number().int().positive().nullable(),
  targetScore: z.number().int().positive().nullable(),
  /** Finished rounds (aborted rounds do not count). */
  roundsPlayed: z.number().int().nonnegative(),
  winnerId: z.uuid().nullable(),
  standings: z.array(seriesStandingSchema),
});
export type SeriesSummary = z.infer<typeof seriesSummarySchema>;

export const seriesRoundSchema = z.object({
  roundNumber: z.number().int().positive(),
  matchId: z.uuid(),
  roomId: z.uuid(),
  status: z.enum(['PLAYING', 'FINISHED', 'ABORTED']),
  finishedAt: z.iso.datetime().nullable(),
  results: z.array(
    publicPlayerSchema.extend({
      placement: z.number().int().min(1).max(PLAYERS_PER_MATCH).nullable(),
      roundScore: z.number().int().nullable(),
      penaltyPoints: z.number().int().nonnegative().nullable(),
    }),
  ),
});
export type SeriesRound = z.infer<typeof seriesRoundSchema>;

/** GET /series/:seriesId: every round and the cumulative standings. */
export const seriesDetailSchema = seriesSummarySchema.extend({
  rules: gameRulesSchema.nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  rounds: z.array(seriesRoundSchema),
  /** The open room of the next round, if someone has started it. */
  nextRoomId: z.uuid().nullable(),
});
export type SeriesDetail = z.infer<typeof seriesDetailSchema>;

export const roomListFilterSchema = z.object({
  /** Maximum entry fee (inclusive); undefined = any. */
  maxEntryFee: z.number().int().nonnegative().optional(),
  onlyWithSeats: z.boolean().default(false),
});
export type RoomListFilter = z.input<typeof roomListFilterSchema>;

export const roomSeatPlayerSchema = publicPlayerSchema.extend({
  isReady: z.boolean(),
  isHost: z.boolean(),
  connected: z.boolean(),
});
export type RoomSeatPlayer = z.infer<typeof roomSeatPlayerSchema>;

export const roomSeatSchema = z.object({
  seatIndex: seatIndexSchema,
  player: roomSeatPlayerSchema.nullable(),
});
export type RoomSeat = z.infer<typeof roomSeatSchema>;

/** Waiting-room view. Only returned to members of the room (or for public rooms). */
export const roomDetailSchema = roomSummarySchema.extend({
  hostId: z.uuid(),
  turnTimerSeconds: z.number().int().positive(),
  seats: z.array(roomSeatSchema).length(PLAYERS_PER_MATCH),
  mySeat: seatIndexSchema.nullable(),
  matchId: z.uuid().nullable(),
  /**
   * After the match: the open "play again" room another player started, if any. Optional so
   * the web app keeps working while an older API (deployed separately) is still live.
   */
  rematchRoomId: z.uuid().nullable().default(null),
  /** The rules the next match will be played by (the room's, or the active preset's). */
  rules: gameRulesSchema.nullable().default(null),
  /** True when the viewer watches the room without a seat. */
  isSpectator: z.boolean().default(false),
  spectators: z.array(publicPlayerSchema).default([]),
  /** The multi-round series this room is a round of, with the standings so far. */
  series: seriesSummarySchema.nullable().default(null),
});
export type RoomDetail = z.infer<typeof roomDetailSchema>;

/**
 * The room the caller is seated in, if any (`GET /rooms/current`): one seat per user, so this
 * is where an unfinished game continues after a reload, a new device or leaving the table.
 */
export const currentRoomSchema = z.object({
  room: roomSummarySchema.nullable(),
});
export type CurrentRoom = z.infer<typeof currentRoomSchema>;

/** Allowed creation options, from the active server-side rule preset. */
export const roomOptionsSchema = z.object({
  entryFees: z.array(coinsSchema.nonnegative()).min(1),
  turnTimers: z.array(z.number().int().positive()).min(1),
});
export type RoomOptions = z.infer<typeof roomOptionsSchema>;

export const leaderboardEntrySchema = publicPlayerSchema.extend({
  rank: z.number().int().positive(),
  wins: z.number().int().nonnegative(),
  matchesPlayed: z.number().int().nonnegative(),
  /** Percentage with one decimal place (wins / matches played). */
  winRate: z.number().min(0).max(100),
  /** Sum of round scores (docs/GAME_RULES.md §11a). Optional for an older API. */
  points: z.number().int().default(0),
  bestStreak: z.number().int().nonnegative().default(0),
  chops: z.number().int().nonnegative().default(0),
  /** Average penalty points per round, one decimal place. */
  averagePenalty: z.number().nonnegative().default(0),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const dailyRewardStatusSchema = z.object({
  claimable: z.boolean(),
  /** Day of the current streak that the next claim counts as (1-based). */
  streakDay: z.number().int().positive(),
  amount: coinsSchema.nonnegative(),
  /** Start of the next reward period (Asia/Ho_Chi_Minh midnight). */
  nextClaimAt: z.iso.datetime(),
});
export type DailyRewardStatus = z.infer<typeof dailyRewardStatusSchema>;

export const notificationTypeSchema = z.enum([
  'DAILY_REWARD',
  'MATCH_RESULT',
  'ROOM_INVITATION',
  'SECURITY',
  'ADMIN_NOTICE',
]);

export const notificationItemSchema = z.object({
  id: z.uuid(),
  type: notificationTypeSchema,
  title: z.string(),
  body: z.string(),
  /** In-app path to open, e.g. a match in the history; null when there is nothing to open. */
  link: z.string().startsWith('/').nullable(),
  createdAt: z.iso.datetime(),
  readAt: z.iso.datetime().nullable(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationPageSchema = z.object({
  items: z.array(notificationItemSchema),
  /** Pass as `cursor` for older notifications; null at the end. */
  nextCursor: z.uuid().nullable(),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const matchmakingStatusSchema = z.object({
  state: z.enum(['IDLE', 'SEARCHING', 'MATCHED']),
  entryFee: coinsSchema.nonnegative().nullable(),
  roomId: z.uuid().nullable(),
});
export type MatchmakingStatus = z.infer<typeof matchmakingStatusSchema>;
