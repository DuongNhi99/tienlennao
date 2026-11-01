import { z } from 'zod';

/**
 * Admin area contracts (Phase 7). Every administrative change requires a reason and is written
 * to the audit log; nothing here edits or deletes ledger rows or finished match results.
 */

const reasonSchema = z.string().trim().min(3, 'Vui lòng nhập lý do (ít nhất 3 ký tự).').max(500);
const isoDate = z.iso.datetime();
const healthStatusSchema = z.enum(['up', 'down']);
const count = z.number().int().nonnegative();

export const adminOverviewSchema = z.object({
  users: z.object({ total: count, active: count, suspended: count, newLast7Days: count }),
  rooms: z.object({ open: count }),
  matches: z.object({
    playing: count,
    finishedLast24h: count,
    finishedLast7Days: count,
    abortedLast7Days: count,
  }),
  /** Sum of all wallet balances (virtual coins in circulation). */
  coinsInCirculation: count,
  incidents: z.object({ timeoutsLast24h: count, flaggedMatches: count, openReports: count }),
  health: z.object({ database: healthStatusSchema, redis: healthStatusSchema }),
  generatedAt: isoDate,
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

export const adminUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  role: z.enum(['PLAYER', 'ADMIN']),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']),
  emailVerified: z.boolean(),
  suspensionReason: z.string().nullable(),
  createdAt: isoDate,
  lastLoginAt: isoDate.nullable(),
  balance: count,
  matchesPlayed: count,
  matchesWon: count,
  activeSessions: count,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/** `q`: part of a display name or email, or an exact user ID. */
export const adminUserSearchQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const adminCoinAdjustmentRequestSchema = z.object({
  /** Signed: credit > 0, debit < 0. A debit may not take the balance below zero. */
  amount: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((amount) => amount !== 0, 'Số xu điều chỉnh phải khác 0.'),
  reason: reasonSchema,
  /** Client-generated: repeating a request with the same ID applies it once. */
  requestId: z.uuid(),
});
export type AdminCoinAdjustmentRequest = z.infer<typeof adminCoinAdjustmentRequestSchema>;

export const adminNoticeRequestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(500),
});
export type AdminNoticeRequest = z.infer<typeof adminNoticeRequestSchema>;

export const adminReasonRequestSchema = z.object({ reason: reasonSchema });
export type AdminReasonRequest = z.infer<typeof adminReasonRequestSchema>;

export const adminFlagMatchRequestSchema = z.object({ flagged: z.boolean(), reason: reasonSchema });
export type AdminFlagMatchRequest = z.infer<typeof adminFlagMatchRequestSchema>;

export const adminMatchSchema = z.object({
  id: z.uuid(),
  roomId: z.uuid(),
  roomCode: z.string(),
  status: z.enum(['CREATED', 'DEALING', 'PLAYING', 'RESOLVING', 'FINISHED', 'ABORTED']),
  entryFee: count,
  flaggedForReview: z.boolean(),
  abortReason: z.string().nullable(),
  startedAt: isoDate.nullable(),
  finishedAt: isoDate.nullable(),
  settledAt: isoDate.nullable(),
  timeouts: count,
  openReports: count,
  players: z.array(
    z.object({
      userId: z.uuid(),
      displayName: z.string(),
      seatIndex: z.number().int(),
      placement: z.number().int().nullable(),
      coinDelta: z.number().int().nullable(),
    }),
  ),
});
export type AdminMatch = z.infer<typeof adminMatchSchema>;

export const adminMatchListQuerySchema = z.object({
  status: z.enum(['PLAYING', 'FINISHED', 'ABORTED']).optional(),
  flagged: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  userId: z.uuid().optional(),
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const adminMatchPageSchema = z.object({
  items: z.array(adminMatchSchema),
  nextCursor: z.uuid().nullable(),
});
export type AdminMatchPage = z.infer<typeof adminMatchPageSchema>;

/** The full event log, including the deal: administrators investigate with it. */
export const adminMatchEventSchema = z.object({
  sequence: count,
  type: z.string(),
  actorUserId: z.uuid().nullable(),
  actionId: z.string().nullable(),
  payload: z.unknown(),
  createdAt: isoDate,
});

export const adminMatchDetailSchema = adminMatchSchema.extend({
  events: z.array(adminMatchEventSchema),
});
export type AdminMatchDetail = z.infer<typeof adminMatchDetailSchema>;

export const adminReportSchema = z.object({
  id: z.uuid(),
  reason: z.enum(['CHEATING', 'COLLUSION', 'ABUSIVE_CHAT', 'SPAM', 'OTHER']),
  details: z.string().nullable(),
  status: z.enum(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED']),
  matchId: z.uuid().nullable(),
  reporter: z.object({ id: z.uuid(), displayName: z.string() }),
  reported: z.object({ id: z.uuid(), displayName: z.string() }),
  resolutionNote: z.string().nullable(),
  createdAt: isoDate,
  resolvedAt: isoDate.nullable(),
});
export type AdminReport = z.infer<typeof adminReportSchema>;

export const adminReportListQuerySchema = z.object({
  status: z.enum(['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED']).optional(),
});

export const adminResolveReportRequestSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  reason: reasonSchema,
});
export type AdminResolveReportRequest = z.infer<typeof adminResolveReportRequestSchema>;

export const adminRulePresetSchema = z.object({
  id: z.uuid(),
  key: z.string(),
  version: z.number().int().positive(),
  name: z.string(),
  isActive: z.boolean(),
  rules: z.unknown(),
  allowedEntryFees: z.array(z.number().int().nonnegative()),
  allowedTurnTimers: z.array(z.number().int().positive()),
  createdAt: isoDate,
  createdBy: z.string().nullable(),
});
export type AdminRulePreset = z.infer<typeof adminRulePresetSchema>;

const unique = (values: number[]) => new Set(values).size === values.length;

/** A new preset version. Existing versions are never edited: matches keep a snapshot. */
export const adminCreateRulePresetRequestSchema = z.object({
  name: z.string().trim().min(3).max(96),
  /** Validated against gameRulesSchema on the server. */
  rules: z.unknown(),
  allowedEntryFees: z
    .array(z.number().int().min(0).max(1_000_000))
    .min(1)
    .max(10)
    .refine(unique, 'Mỗi mức cược chỉ xuất hiện một lần.'),
  allowedTurnTimers: z
    .array(z.number().int().min(5).max(300))
    .min(1)
    .max(10)
    .refine(unique, 'Mỗi thời gian lượt chỉ xuất hiện một lần.'),
  activate: z.boolean(),
  reason: reasonSchema,
});
export type AdminCreateRulePresetRequest = z.infer<typeof adminCreateRulePresetRequestSchema>;

export const adminAuditEntrySchema = z.object({
  id: z.uuid(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  reason: z.string().nullable(),
  metadata: z.unknown(),
  actor: z.object({ id: z.uuid(), displayName: z.string() }).nullable(),
  ipAddress: z.string().nullable(),
  createdAt: isoDate,
});
export type AdminAuditEntry = z.infer<typeof adminAuditEntrySchema>;

export const adminAuditPageSchema = z.object({
  items: z.array(adminAuditEntrySchema),
  nextCursor: z.uuid().nullable(),
});
export type AdminAuditPage = z.infer<typeof adminAuditPageSchema>;
