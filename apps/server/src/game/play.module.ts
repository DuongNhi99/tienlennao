import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MatchmakingController } from '../matchmaking/matchmaking.controller';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeModule } from '../realtime/realtime.module';
import { RoomsController } from '../rooms/rooms.controller';
import { RoomsService } from '../rooms/rooms.service';
import { SpectatorsService } from '../rooms/spectators.service';
import { InvitationsController } from '../invitations/invitations.controller';
import { InvitationsService } from '../invitations/invitations.service';
import { SeriesController } from '../series/series.controller';
import { SeriesService } from '../series/series.service';
import { Dealer } from './dealer';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { RulePresetsService } from './rule-presets.service';

/**
 * Multiplayer: rooms, quick match, authoritative matches and the realtime channel.
 * Dependencies point one way: controllers → matchmaking → game → invitations/spectators →
 * rooms → series → realtime.
 */
@Module({
  imports: [AuthModule, RateLimitModule, RealtimeModule, WalletModule, NotificationsModule],
  controllers: [
    RoomsController,
    GameController,
    MatchmakingController,
    InvitationsController,
    SeriesController,
  ],
  providers: [
    RulePresetsService,
    Dealer,
    SeriesService,
    RoomsService,
    SpectatorsService,
    InvitationsService,
    GameService,
    MatchmakingService,
    RealtimeGateway,
  ],
  exports: [RoomsService, GameService],
})
export class PlayModule {}
