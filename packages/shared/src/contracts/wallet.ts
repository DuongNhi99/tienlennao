import { z } from 'zod';

/** Ledger entry types; must match the `WalletTransactionType` database enum (tested). */
export const WALLET_TRANSACTION_TYPES = [
  'INITIAL_BONUS',
  'DAILY_REWARD',
  'MATCH_ENTRY',
  'MATCH_REWARD',
  'MATCH_REFUND',
  'ADMIN_ADJUSTMENT',
  'ACHIEVEMENT_REWARD',
] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export const WALLET_TRANSACTION_LABELS_VI: Readonly<Record<WalletTransactionType, string>> = {
  INITIAL_BONUS: 'Quà chào mừng',
  DAILY_REWARD: 'Thưởng hằng ngày',
  MATCH_ENTRY: 'Phí vào bàn',
  MATCH_REWARD: 'Thưởng ván đấu',
  MATCH_REFUND: 'Hoàn phí vào bàn',
  ADMIN_ADJUSTMENT: 'Điều chỉnh của quản trị viên',
  ACHIEVEMENT_REWARD: 'Thưởng thành tích',
};

export const walletSummarySchema = z.object({
  balance: z.number().int().nonnegative(),
  totalEarned: z.number().int().nonnegative(),
  totalSpent: z.number().int().nonnegative(),
});
export type WalletSummary = z.infer<typeof walletSummarySchema>;

/** A ledger row as the owner sees it. Credits are positive, debits negative. */
export const walletTransactionSchema = z.object({
  id: z.uuid(),
  type: z.enum(WALLET_TRANSACTION_TYPES),
  amount: z.number().int(),
  balanceAfter: z.number().int().nonnegative(),
  matchId: z.uuid().nullable(),
  /** Reason for administrative adjustments; null otherwise. */
  reason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type WalletTransaction = z.infer<typeof walletTransactionSchema>;

export const walletTransactionPageSchema = z.object({
  items: z.array(walletTransactionSchema),
  /** Pass as `cursor` to fetch the next (older) page; null at the end. */
  nextCursor: z.uuid().nullable(),
});
export type WalletTransactionPage = z.infer<typeof walletTransactionPageSchema>;

export const walletTransactionsQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const dailyRewardClaimSchema = z.object({
  amount: z.number().int().positive(),
  balance: z.number().int().nonnegative(),
});
export type DailyRewardClaim = z.infer<typeof dailyRewardClaimSchema>;
