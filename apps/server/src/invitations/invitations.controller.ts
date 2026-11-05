import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { type Invitation, type InvitationList, invitationTokenSchema } from '@tienlen/shared';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { InvitationsService } from './invitations.service';

const idPipe = new ZodValidationPipe(z.uuid());
const tokenPipe = new ZodValidationPipe(invitationTokenSchema);
/** Responses and link look-ups; links are unguessable, this only stops scripted probing. */
const RESPONSES = { limit: 60, windowSeconds: 600 };

/** The caller's received invitations, and link invitations (`/invite/<token>` in the app). */
@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly matchmaking: MatchmakingService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get()
  received(@CurrentUser() user: SessionUser): Promise<InvitationList> {
    return this.invitations.received(user.id);
  }

  @Get('link/:token')
  async preview(
    @CurrentUser() user: SessionUser,
    @Param('token', tokenPipe) token: string,
  ): Promise<Invitation> {
    await this.limit(user);
    return this.invitations.preview(token);
  }

  @Post('link/:token/accept')
  @HttpCode(HttpStatus.OK)
  async acceptLink(
    @CurrentUser() user: SessionUser,
    @Param('token', tokenPipe) token: string,
  ): Promise<{ roomId: string }> {
    await this.limit(user);
    await this.matchmaking.leaveQueue(user.id);
    return this.invitations.acceptLink(user.id, token);
  }

  @Post(':invitationId/accept')
  @HttpCode(HttpStatus.OK)
  async accept(
    @CurrentUser() user: SessionUser,
    @Param('invitationId', idPipe) invitationId: string,
  ): Promise<{ roomId: string }> {
    await this.limit(user);
    await this.matchmaking.leaveQueue(user.id);
    return this.invitations.accept(user.id, invitationId);
  }

  @Post(':invitationId/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentUser() user: SessionUser,
    @Param('invitationId', idPipe) invitationId: string,
  ): Promise<Invitation> {
    await this.limit(user);
    return this.invitations.reject(user.id, invitationId);
  }

  @Post(':invitationId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() user: SessionUser,
    @Param('invitationId', idPipe) invitationId: string,
  ): Promise<Invitation> {
    await this.limit(user);
    return this.invitations.cancel(user.id, invitationId);
  }

  private limit(user: SessionUser): Promise<void> {
    return this.rateLimit.enforce(`invitation-responses:user:${user.id}`, RESPONSES);
  }
}
