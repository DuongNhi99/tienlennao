import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma, WalletTransaction, WalletTransactionType } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';

export interface LedgerEntry {
  userId: string;
  type: WalletTransactionType;
  /** Signed: credits > 0, debits < 0, never 0. */
  amount: number;
  /** Unique per user: posting the same key again returns the first row and changes nothing. */
  idempotencyKey: string;
  matchId?: string | null;
  actorId?: string | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * The append-only coin ledger (docs/ECONOMY.md). Every balance change is one ledger row written
 * in the caller's transaction together with one conditional balance update, so concurrent
 * debits cannot overspend and the balance can never go negative.
 */
@Injectable()
export class LedgerService {
  async post(tx: Prisma.TransactionClient, entry: LedgerEntry): Promise<WalletTransaction> {
    const { userId, amount, idempotencyKey } = entry;
    if (!Number.isSafeInteger(amount) || amount === 0) {
      throw new Error(`Invalid ledger amount: ${amount}`);
    }
    const existing = await tx.walletTransaction.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });
    if (existing) return existing;

    const credit = Math.max(amount, 0);
    const debit = Math.max(-amount, 0);
    const [wallet] = await tx.$queryRaw<{ id: string; balance: number }[]>`
      UPDATE wallets
      SET balance = balance + ${amount},
          "totalEarned" = "totalEarned" + ${credit},
          "totalSpent" = "totalSpent" + ${debit},
          version = version + 1,
          "updatedAt" = now()
      WHERE "userId" = ${userId}::uuid AND balance + ${amount} >= 0
      RETURNING id, balance`;
    if (!wallet) {
      const exists = await tx.wallet.findUnique({ where: { userId }, select: { id: true } });
      throw exists
        ? new AppException('INSUFFICIENT_COINS', HttpStatus.CONFLICT)
        : new AppException('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        userId,
        type: entry.type,
        amount,
        balanceAfter: wallet.balance,
        idempotencyKey,
        matchId: entry.matchId ?? null,
        actorId: entry.actorId ?? null,
        reason: entry.reason ?? null,
        metadata: entry.metadata,
      },
    });
  }
}
