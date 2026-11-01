import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { WalletSummary, WalletTransactionPage } from '@tienlen/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Ledger idempotency key for the one-time sign-up bonus (unique per user). */
const INITIAL_BONUS_KEY = 'initial-bonus';

export interface Reconciliation {
  balance: number;
  ledgerSum: number;
  lastBalanceAfter: number;
  /** True when the balance, the ledger sum, the latest row and both totals all agree. */
  consistent: boolean;
}

/**
 * Wallet reads and the sign-up bonus. Every other balance change goes through LedgerService.
 * Balances never come from client input.
 */
@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  /** Opens the user's wallet with the server-configured bonus, inside the caller's transaction. */
  async openWithInitialBonus(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
  ): Promise<void> {
    const wallet = await tx.wallet.create({
      data: {
        userId,
        balance: amount,
        totalEarned: amount,
        version: amount > 0 ? 1 : 0,
      },
    });
    if (amount > 0) {
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          userId,
          type: 'INITIAL_BONUS',
          amount,
          balanceAfter: amount,
          idempotencyKey: INITIAL_BONUS_KEY,
        },
      });
    }
  }

  async summary(userId: string): Promise<WalletSummary> {
    const wallet = await this.prisma.wallet.findUniqueOrThrow({
      where: { userId },
      select: { balance: true, totalEarned: true, totalSpent: true },
    });
    return wallet;
  }

  /** Newest first. `cursor` is the ID of the last row of the previous page. */
  async transactions(
    userId: string,
    { cursor, limit }: { cursor?: string; limit: number },
  ): Promise<WalletTransactionPage> {
    const rows = await this.prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        matchId: true,
        reason: true,
        createdAt: true,
      },
    });
    const items = rows.slice(0, limit);
    return {
      items: items.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      nextCursor: rows.length > limit ? items.at(-1)!.id : null,
    };
  }

  /** Checks a wallet against its ledger (docs/ECONOMY.md, "Reconciliation"). */
  async reconcile(userId: string): Promise<Reconciliation> {
    const wallet = await this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
    const [sums, credits, debits, last] = await Promise.all([
      this.prisma.walletTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
      this.prisma.walletTransaction.aggregate({
        where: { userId, amount: { gt: 0 } },
        _sum: { amount: true },
      }),
      this.prisma.walletTransaction.aggregate({
        where: { userId, amount: { lt: 0 } },
        _sum: { amount: true },
      }),
      this.prisma.walletTransaction.findFirst({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { balanceAfter: true },
      }),
    ]);
    const ledgerSum = sums._sum.amount ?? 0;
    const lastBalanceAfter = last?.balanceAfter ?? 0;
    return {
      balance: wallet.balance,
      ledgerSum,
      lastBalanceAfter,
      consistent:
        wallet.balance === ledgerSum &&
        wallet.balance === lastBalanceAfter &&
        wallet.totalEarned === (credits._sum.amount ?? 0) &&
        wallet.totalSpent === -(debits._sum.amount ?? 0),
    };
  }
}
