import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import {
  type DailyRewardClaim,
  type DailyRewardStatus,
  type WalletSummary,
  type WalletTransactionPage,
  walletTransactionsQuerySchema,
} from '@tienlen/shared';
import type { z } from 'zod';
import { CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { RewardsService } from './rewards.service';
import { WalletService } from './wallet.service';

/** The caller's own wallet only; there is no way to read another user's ledger here. */
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  summary(@CurrentUser() user: SessionUser): Promise<WalletSummary> {
    return this.wallet.summary(user.id);
  }

  @Get('transactions')
  transactions(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(walletTransactionsQuerySchema))
    query: z.output<typeof walletTransactionsQuerySchema>,
  ): Promise<WalletTransactionPage> {
    return this.wallet.transactions(user.id, query);
  }
}

@Controller('rewards')
export class RewardsController {
  constructor(
    private readonly rewards: RewardsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get('daily')
  daily(@CurrentUser() user: SessionUser): Promise<DailyRewardStatus> {
    return this.rewards.dailyStatus(user.id);
  }

  @Post('daily/claim')
  @HttpCode(HttpStatus.OK)
  async claim(@CurrentUser() user: SessionUser): Promise<DailyRewardClaim> {
    await this.rateLimit.enforce(`rewards:user:${user.id}`, { limit: 10, windowSeconds: 60 });
    return this.rewards.claimDaily(user.id);
  }
}
