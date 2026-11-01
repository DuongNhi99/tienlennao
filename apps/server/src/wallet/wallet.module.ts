import { Module } from '@nestjs/common';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { LedgerService } from './ledger.service';
import { RewardsService } from './rewards.service';
import { RewardsController, WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

/** The coin ledger, wallet reads, daily rewards and achievements (docs/ECONOMY.md). */
@Module({
  imports: [RateLimitModule],
  controllers: [WalletController, RewardsController],
  providers: [LedgerService, WalletService, RewardsService],
  exports: [LedgerService, WalletService, RewardsService],
})
export class WalletModule {}
