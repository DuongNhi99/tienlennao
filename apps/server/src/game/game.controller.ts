import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  type MatchResult,
  type PassRequest,
  passRequestSchema,
  type PlayCardsRequest,
  playCardsRequestSchema,
  type PlayerGameView,
} from '@tienlen/shared';
import { CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { roomIdPipe } from '../rooms/rooms.controller';
import { GameService } from './game.service';

/** Generous for a turn-based game; stops scripted flooding. */
const GAME_ACTIONS = { limit: 30, windowSeconds: 10 };

/** The match of a room, from the caller's seat. Only the caller's own hand is ever returned. */
@Controller('rooms/:roomId/game')
export class GameController {
  constructor(
    private readonly game: GameService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get()
  view(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
  ): Promise<PlayerGameView> {
    return this.game.view(roomId, user.id);
  }

  @Post('play')
  @HttpCode(HttpStatus.OK)
  async play(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
    @Body(new ZodValidationPipe(playCardsRequestSchema)) body: PlayCardsRequest,
  ): Promise<PlayerGameView> {
    await this.limit(user);
    return this.game.play(roomId, user.id, body);
  }

  @Post('pass')
  @HttpCode(HttpStatus.OK)
  async pass(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
    @Body(new ZodValidationPipe(passRequestSchema)) body: PassRequest,
  ): Promise<PlayerGameView> {
    await this.limit(user);
    return this.game.pass(roomId, user.id, body);
  }

  @Get('result')
  result(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
  ): Promise<MatchResult> {
    return this.game.result(roomId, user.id);
  }

  private limit(user: SessionUser): Promise<void> {
    return this.rateLimit.enforce(`game:user:${user.id}`, GAME_ACTIONS);
  }
}
