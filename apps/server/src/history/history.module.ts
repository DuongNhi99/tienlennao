import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { HistoryController, LeaderboardController, ReportsController } from './history.controller';
import { HistoryService } from './history.service';

/** Match history, leaderboards and player reports. */
@Module({
  imports: [AuthModule, RateLimitModule],
  controllers: [HistoryController, LeaderboardController, ReportsController],
  providers: [HistoryService],
  exports: [HistoryService],
})
export class HistoryModule {}
