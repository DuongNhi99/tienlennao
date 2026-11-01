import { Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';

/** One shared RateLimitService, so its in-memory fallback counters are shared as well. */
@Module({
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
