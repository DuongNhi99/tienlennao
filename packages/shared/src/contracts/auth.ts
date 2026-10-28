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
