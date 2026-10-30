import { z } from 'zod';

export const userRoleSchema = z.enum(['PLAYER', 'ADMIN']);
export type UserRole = z.infer<typeof userRoleSchema>;

/** The authenticated user as returned by /auth/* and /users/me. Never includes secrets. */
export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  role: userRoleSchema,
  emailVerified: z.boolean(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authResponseSchema = z.object({ user: authUserSchema });
export type AuthResponse = z.infer<typeof authResponseSchema>;

/** Generic acknowledgement for endpoints that must not reveal account existence. */
export const messageResponseSchema = z.object({ message: z.string() });
export type MessageResponse = z.infer<typeof messageResponseSchema>;

/** Accepted avatar uploads. The server re-encodes every image, so only these inputs are read. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/** GET /users/me/stats. Only FINISHED matches count; `winRate` uses `winRatePercent`. */
export const userStatsSchema = z.object({
  matchesPlayed: z.number().int().nonnegative(),
  matchesWon: z.number().int().nonnegative(),
  matchesLost: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(100),
});
export type UserStats = z.infer<typeof userStatsSchema>;
