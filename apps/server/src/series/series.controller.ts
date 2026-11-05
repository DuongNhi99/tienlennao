import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import type { SeriesDetail } from '@tienlen/shared';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { SeriesService } from './series.service';

const idPipe = new ZodValidationPipe(z.uuid());

/** Multi-round matches: rounds and standings (participants only), and the host's manual end. */
@Controller('series')
export class SeriesController {
  constructor(
    private readonly series: SeriesService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get(':seriesId')
  detail(
    @CurrentUser() user: SessionUser,
    @Param('seriesId', idPipe) seriesId: string,
  ): Promise<SeriesDetail> {
    return this.series.detail(seriesId, user.id);
  }

  /** Host-only, between rounds. */
  @Post(':seriesId/finish')
  @HttpCode(HttpStatus.OK)
  async finish(
    @CurrentUser() user: SessionUser,
    @Param('seriesId', idPipe) seriesId: string,
  ): Promise<SeriesDetail> {
    await this.rateLimit.enforce(`series:user:${user.id}`, { limit: 20, windowSeconds: 60 });
    return this.series.finish(seriesId, user.id);
  }
}
