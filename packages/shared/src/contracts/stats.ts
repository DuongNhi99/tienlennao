import { z } from 'zod';
import { PLAYERS_PER_MATCH } from '../constants/game';
import { publicPlayerSchema } from './lobby';

/**
 * Player statistics, profiles and achievements. Statistics are **round-based**: one finished
 * match (a single hand, Vietnamese "ván") is one round. Aborted rounds never count. Series
 * (multi-round matches) are counted separately in `series`.
 */

const count = z.number().int().nonnegative();

export const profileVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);
export type ProfileVisibility = z.infer<typeof profileVisibilitySchema>;

export const playerStatisticsSchema = z.object({
  roundsPlayed: count,
  roundsWon: count,
  /** Percentage with one decimal place (`winRatePercent`). */
  winRate: z.number().min(0).max(100),
  /** Mean finishing place, one decimal place; null before the first round. */
  averagePlace: z.number().min(1).max(PLAYERS_PER_MATCH).nullable(),
  /** How often the player finished 1st, 2nd, 3rd and 4th. */
  placements: z.array(z.object({ place: z.number().int().min(1).max(4), count })).length(4),
  /** Rounds finished in last place, whatever the number of players. */
  lastPlaces: count,
  cardsPlayed: count,
  chopsMade: count,
  /** Chops of a 2 or a pair of 2s ("chặt heo"). */
  twosChopped: count,
  chopsReceived: count,
  /** 2s still held at the end of a round (thúi heo). */
  twosLeft: count,
  penaltyPoints: count,
  /** Sum of round scores. */
  totalScore: z.number().int(),
  streaks: z.object({ currentWin: count, bestWin: count, currentLoss: count, longestLoss: count }),
  series: z.object({ played: count, won: count }),
  /** The latest rounds, newest first (at most 20). */
  recent: z.array(
    z.object({
      matchId: z.uuid(),
      finishedAt: z.iso.datetime(),
      placement: z.number().int().min(1).max(PLAYERS_PER_MATCH),
      players: z.number().int().min(2).max(PLAYERS_PER_MATCH),
      roundScore: z.number().int().nullable(),
      penaltyPoints: count.nullable(),
    }),
  ),
  /** The last 12 weeks (Monday 00:00 Vietnam time), oldest first; empty weeks included. */
  weekly: z.array(
    z.object({
      weekStart: z.iso.datetime(),
      played: count,
      won: count,
      score: z.number().int(),
      penaltyPoints: count,
    }),
  ),
});
export type PlayerStatistics = z.infer<typeof playerStatisticsSchema>;

export const achievementItemSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string(),
  rewardAmount: count,
  /** Null while locked. */
  unlockedAt: z.iso.datetime().nullable(),
});
export type AchievementItem = z.infer<typeof achievementItemSchema>;

/**
 * GET /users/:userId/profile. A PRIVATE profile shows other players the name and avatar only;
 * the owner always sees everything.
 */
export const publicProfileSchema = publicPlayerSchema.extend({
  createdAt: z.iso.datetime(),
  visibility: profileVisibilitySchema,
  isMe: z.boolean(),
  statistics: playerStatisticsSchema.nullable(),
  achievements: z.array(achievementItemSchema).nullable(),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

export const updatePrivacyRequestSchema = z.object({ profileVisibility: profileVisibilitySchema });
export type UpdatePrivacyRequest = z.infer<typeof updatePrivacyRequestSchema>;

/** GET /users/search?q=… — players by display name, for invitations. */
export const userSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Nhập ít nhất 2 ký tự.').max(32),
});
export const userSearchResultSchema = z.array(publicPlayerSchema);
