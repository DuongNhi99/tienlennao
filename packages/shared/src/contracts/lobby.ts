import { z } from 'zod';
import { PLAYERS_PER_MATCH } from '../constants/game';
import { ROOM_STATUSES } from '../constants/lifecycle';
import { roomVisibilitySchema } from '../schemas/rooms';

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
});
export type RoomSummary = z.infer<typeof roomSummarySchema>;

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
});
export type RoomDetail = z.infer<typeof roomDetailSchema>;

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
