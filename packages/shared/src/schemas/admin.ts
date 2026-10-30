import { z } from 'zod';

/** PATCH /admin/users/:userId/status. A reason is required and recorded in the audit log. */
export const updateUserStatusRequestSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z.string().trim().min(3, 'Vui lòng nhập lý do (ít nhất 3 ký tự).').max(500),
});
export type UpdateUserStatusRequest = z.infer<typeof updateUserStatusRequestSchema>;

export const adminUserStatusResponseSchema = z.object({
  userId: z.uuid(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']),
  revokedSessions: z.number().int().nonnegative(),
});
export type AdminUserStatusResponse = z.infer<typeof adminUserStatusResponseSchema>;
