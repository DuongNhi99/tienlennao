import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { MyStatsController, PlayersController } from './stats.controller';
import { StatsService } from './stats.service';

/** Player statistics, profiles, achievements and player search. */
@Module({
  imports: [AuthModule, RateLimitModule],
  controllers: [MyStatsController, PlayersController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
