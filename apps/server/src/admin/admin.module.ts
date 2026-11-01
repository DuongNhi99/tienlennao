import { Module } from '@nestjs/common';
import { PlayModule } from '../game/play.module';
import { HealthModule } from '../health/health.module';
import { HistoryModule } from '../history/history.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { WalletModule } from '../wallet/wallet.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    PlayModule,
    HealthModule,
    HistoryModule,
    NotificationsModule,
    RealtimeModule,
    WalletModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
