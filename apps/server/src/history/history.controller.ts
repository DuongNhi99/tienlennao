import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  type CreateReportRequest,
  createReportRequestSchema,
  cursorPageQuerySchema,
  type Leaderboard,
  leaderboardQuerySchema,
  type MatchHistoryDetail,
  type MatchHistoryPage,
} from '@tienlen/shared';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { HistoryService } from './history.service';

/** The caller's own match history. */
@Controller('history')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  matches(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(cursorPageQuerySchema))
    query: z.output<typeof cursorPageQuerySchema>,
  ): Promise<MatchHistoryPage> {
    return this.history.matches(user.id, query);
  }

  @Get(':matchId')
  match(
    @CurrentUser() user: SessionUser,
    @Param('matchId', new ZodValidationPipe(z.uuid())) matchId: string,
  ): Promise<MatchHistoryDetail> {
    return this.history.match(user.id, matchId);
  }
}

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly history: HistoryService) {}

  @Get()
  leaderboard(
    @CurrentUser() user: SessionUser,
    @Query(new ZodValidationPipe(leaderboardQuerySchema))
    query: z.output<typeof leaderboardQuerySchema>,
  ): Promise<Leaderboard> {
    return this.history.leaderboard(query.metric, query.period, query, user.id);
  }
}

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly history: HistoryService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post()
  async report(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createReportRequestSchema)) body: CreateReportRequest,
  ): Promise<{ reportId: string }> {
    await this.rateLimit.enforce(`reports:user:${user.id}`, { limit: 10, windowSeconds: 3600 });
    return this.history.report(user.id, body);
  }
}
