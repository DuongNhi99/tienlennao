import { Body, Controller, Delete, Get, Post } from '@nestjs/common';
import {
  type JoinMatchmakingRequest,
  joinMatchmakingRequestSchema,
  type MatchmakingStatus,
} from '@tienlen/shared';
import { CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { MatchmakingService } from './matchmaking.service';

const MATCHMAKING_COMMANDS = { limit: 30, windowSeconds: 60 };

@Controller('matchmaking')
export class MatchmakingController {
  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get()
  status(@CurrentUser() user: SessionUser): Promise<MatchmakingStatus> {
    return this.matchmaking.status(user.id);
  }

  @Post()
  async join(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(joinMatchmakingRequestSchema)) body: JoinMatchmakingRequest,
  ): Promise<MatchmakingStatus> {
    await this.rateLimit.enforce(`matchmaking:user:${user.id}`, MATCHMAKING_COMMANDS);
    return this.matchmaking.join(user.id, body.entryFee);
  }

  @Delete()
  cancel(@CurrentUser() user: SessionUser): Promise<MatchmakingStatus> {
    return this.matchmaking.cancel(user.id);
  }
}
