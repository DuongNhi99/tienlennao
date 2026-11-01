import { Module } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

/** The notification sender, shared by every feature that tells clients about changes. */
@Module({
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
