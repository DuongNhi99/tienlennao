import {
  type AdminCoinAdjustmentRequest,
  type AdminCreateRulePresetRequest,
  adminAuditPageSchema,
  adminMatchDetailSchema,
  adminMatchPageSchema,
  adminOverviewSchema,
  adminReportSchema,
  adminRulePresetSchema,
  adminUserSchema,
  adminUserStatusResponseSchema,
  matchHistoryPageSchema,
  walletTransactionPageSchema,
} from '@tienlen/shared';
import { z } from 'zod';
import { apiRequest, noContentSchema } from '@/lib/api/client';

/** Admin endpoints. The server checks the ADMIN role on every call; nothing here is trusted. */

const id = encodeURIComponent;
const query = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const adminApi = {
  overview: () => apiRequest('/admin/overview', { schema: adminOverviewSchema }),

  searchUsers: (q: string) =>
    apiRequest(`/admin/users${query({ q, limit: 50 })}`, { schema: adminUserSchema.array() }),
  user: (userId: string) => apiRequest(`/admin/users/${id(userId)}`, { schema: adminUserSchema }),
  userMatches: (userId: string, cursor?: string) =>
    apiRequest(`/admin/users/${id(userId)}/matches${query({ cursor })}`, {
      schema: matchHistoryPageSchema,
    }),
  userTransactions: (userId: string, cursor?: string) =>
    apiRequest(`/admin/users/${id(userId)}/transactions${query({ cursor })}`, {
      schema: walletTransactionPageSchema,
    }),
  setStatus: (userId: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) =>
    apiRequest(`/admin/users/${id(userId)}/status`, {
      method: 'PATCH',
      body: { status, reason },
      schema: adminUserStatusResponseSchema,
    }),
  revokeSessions: (userId: string, reason: string) =>
    apiRequest(`/admin/users/${id(userId)}/sessions/revoke`, {
      method: 'POST',
      body: { reason },
      schema: z.object({ revokedSessions: z.number() }),
    }),
  adjustCoins: (userId: string, request: AdminCoinAdjustmentRequest) =>
    apiRequest(`/admin/users/${id(userId)}/adjustments`, {
      method: 'POST',
      body: request,
      schema: z.object({ transactionId: z.uuid(), balance: z.number() }),
    }),
  sendNotice: (userId: string, notice: { title: string; body: string }) =>
    apiRequest(`/admin/users/${id(userId)}/notices`, {
      method: 'POST',
      body: notice,
      schema: noContentSchema,
    }),

  matches: (filter: { status?: string; flagged?: boolean; cursor?: string }) =>
    apiRequest(`/admin/matches${query(filter)}`, { schema: adminMatchPageSchema }),
  match: (matchId: string) =>
    apiRequest(`/admin/matches/${id(matchId)}`, { schema: adminMatchDetailSchema }),
  flagMatch: (matchId: string, flagged: boolean, reason: string) =>
    apiRequest(`/admin/matches/${id(matchId)}/flag`, {
      method: 'POST',
      body: { flagged, reason },
      schema: adminMatchDetailSchema,
    }),
  abortMatch: (matchId: string, reason: string) =>
    apiRequest(`/admin/matches/${id(matchId)}/abort`, {
      method: 'POST',
      body: { reason },
      schema: adminMatchDetailSchema,
    }),

  reports: (status?: string) =>
    apiRequest(`/admin/reports${query({ status })}`, { schema: adminReportSchema.array() }),
  resolveReport: (reportId: string, status: 'RESOLVED' | 'DISMISSED', reason: string) =>
    apiRequest(`/admin/reports/${id(reportId)}/resolve`, {
      method: 'POST',
      body: { status, reason },
      schema: noContentSchema,
    }),

  rulePresets: () => apiRequest('/admin/rule-presets', { schema: adminRulePresetSchema.array() }),
  createRulePreset: (request: AdminCreateRulePresetRequest) =>
    apiRequest('/admin/rule-presets', {
      method: 'POST',
      body: request,
      schema: adminRulePresetSchema,
    }),

  auditLog: (cursor?: string) =>
    apiRequest(`/admin/audit-logs${query({ cursor, limit: 50 })}`, {
      schema: adminAuditPageSchema,
    }),
};
