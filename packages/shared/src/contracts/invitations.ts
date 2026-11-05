import { z } from 'zod';
import { publicPlayerSchema, roomStatusSchema } from './lobby';

/**
 * Room invitations (README, "Invitations").
 *
 * - DIRECT: to one player, who accepts (and is seated) or rejects it. Single use.
 * - LINK: a shareable link (`/invite/<token>`), reusable by anyone who holds it until it expires
 *   or is cancelled; each use seats one player while seats are free. The token is shown once,
 *   to its creator, and only its hash is stored.
 *
 * Both expire after INVITATION_TTL_HOURS, and become CANCELLED when the room closes or starts.
 * Accepting skips the room password: the invitation is the permission.
 */

export const INVITATION_KINDS = ['DIRECT', 'LINK'] as const;
export const INVITATION_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];
export const INVITATION_TTL_HOURS = 24;

/** 32 random bytes, base64url. */
export const invitationTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'Liên kết không hợp lệ.');

export const invitationSchema = z.object({
  id: z.uuid(),
  kind: z.enum(INVITATION_KINDS),
  status: z.enum(INVITATION_STATUSES),
  room: z.object({
    id: z.uuid(),
    code: z.string(),
    name: z.string().nullable(),
    status: roomStatusSchema,
    playerCount: z.number().int().nonnegative(),
    maxPlayers: z.number().int().positive(),
    entryFee: z.number().int().nonnegative(),
  }),
  inviter: publicPlayerSchema,
  /** Null for LINK invitations. */
  invitee: publicPlayerSchema.nullable(),
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  respondedAt: z.iso.datetime().nullable(),
  useCount: z.number().int().nonnegative(),
});
export type Invitation = z.infer<typeof invitationSchema>;

/** POST /rooms/:roomId/invitations — `inviteeId` for a direct invitation, none for a link. */
export const createInvitationRequestSchema = z.object({ inviteeId: z.uuid().optional() });
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

/** The created invitation; `link` (an in-app path) is returned once, for LINK invitations. */
export const createdInvitationSchema = invitationSchema.extend({
  link: z.string().startsWith('/invite/').nullable(),
});
export type CreatedInvitation = z.infer<typeof createdInvitationSchema>;

export const invitationListSchema = z.object({ items: z.array(invitationSchema) });
export type InvitationList = z.infer<typeof invitationListSchema>;
