import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Ledger idempotency key for the one-time sign-up bonus (unique per user). */
const INITIAL_BONUS_KEY = 'initial-bonus';

/**
 * Wallet operations. Phase 3 only opens wallets; the full ledger service (entry fees,
 * settlement, rewards) arrives in Phase 6. Balances never come from client input.
 */
@Injectable()
export class WalletService {
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
}
