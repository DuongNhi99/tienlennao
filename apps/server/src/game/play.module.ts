import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MatchmakingController } from '../matchmaking/matchmaking.controller';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeService } from '../realtime/realtime.service';
import { RoomsController } from '../rooms/rooms.controller';
import { RoomsService } from '../rooms/rooms.service';
import { Dealer } from './dealer';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { RulePresetsService } from './rule-presets.service';

/**
 * Multiplayer: rooms, quick match, authoritative matches and the realtime channel.
 * Dependencies point one way: controllers → matchmaking → game → rooms → realtime.
 */
@Module({
  imports: [AuthModule],
  controllers: [RoomsController, GameController, MatchmakingController],
  providers: [
    RulePresetsService,
    Dealer,
    RoomsService,
    GameService,
    MatchmakingService,
    PresenceService,
    RealtimeService,
    RealtimeGateway,
  ],
  exports: [RoomsService, GameService],
})
export class PlayModule {}
