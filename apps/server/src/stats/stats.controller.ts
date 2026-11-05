import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  type AchievementItem,
  type PlayerStatistics,
  type PublicPlayer,
  type PublicProfile,
  type UpdatePrivacyRequest,
  updatePrivacyRequestSchema,
  userSearchQuerySchema,
} from '@tienlen/shared';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { StatsService } from './stats.service';

/** The caller's own statistics, achievements and privacy setting. */
@Controller('users/me')
export class MyStatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('statistics')
  statistics(@CurrentUser() user: SessionUser): Promise<PlayerStatistics> {
    return this.stats.statistics(user.id);
  }

  @Get('achievements')
  achievements(@CurrentUser() user: SessionUser): Promise<AchievementItem[]> {
    return this.stats.achievements(user.id);
  }

  @Patch('privacy')
  privacy(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(updatePrivacyRequestSchema)) body: UpdatePrivacyRequest,
  ): Promise<PublicProfile> {
    return this.stats.setVisibility(user.id, body.profileVisibility);
  }
}

/** Other players: search by name (for invitations) and profiles (respecting privacy). */
@Controller('users')
export class PlayersController {
  constructor(
    private readonly stats: StatsService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get('search')
  async search(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(userSearchQuerySchema))
    query: z.output<typeof userSearchQuerySchema>,
  ): Promise<PublicPlayer[]> {
    await this.rateLimit.enforce(`user-search:user:${user.id}`, { limit: 60, windowSeconds: 60 });
    return this.stats.search(user.id, query.q);
  }

  @Get(':userId/profile')
  profile(
    @CurrentUser() user: SessionUser,
    @Param('userId', new ZodValidationPipe(z.uuid())) userId: string,
  ): Promise<PublicProfile> {
    return this.stats.profile(user.id, userId);
  }
}
