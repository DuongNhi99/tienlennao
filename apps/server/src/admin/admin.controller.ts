import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  type AdminAuditPage,
  type AdminCoinAdjustmentRequest,
  adminCoinAdjustmentRequestSchema,
  type AdminCreateRulePresetRequest,
  adminCreateRulePresetRequestSchema,
  type AdminFlagMatchRequest,
  adminFlagMatchRequestSchema,
  type AdminMatchDetail,
  adminMatchListQuerySchema,
  type AdminMatchPage,
  type AdminNoticeRequest,
  adminNoticeRequestSchema,
  type AdminOverview,
  type AdminReasonRequest,
  adminReasonRequestSchema,
  type AdminReport,
  adminReportListQuerySchema,
  type AdminResolveReportRequest,
  adminResolveReportRequestSchema,
  type AdminRulePreset,
  type AdminUser,
  adminUserSearchQuerySchema,
  type AdminUserStatusResponse,
  cursorPageQuerySchema,
  type MatchHistoryPage,
  type UpdateUserStatusRequest,
  updateUserStatusRequestSchema,
  type WalletTransactionPage,
} from '@tienlen/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/decorators';
import type { SessionUser } from '../auth/sessions.service';
import { clientInfo } from '../common/http/client-info';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { HistoryService } from '../history/history.service';
import { WalletService } from '../wallet/wallet.service';
import { type AdminActor, AdminService } from './admin.service';

const idPipe = new ZodValidationPipe(z.uuid());
const pagePipe = new ZodValidationPipe(cursorPageQuerySchema);
type PageQuery = z.output<typeof cursorPageQuerySchema>;

const actorOf = (user: SessionUser, req: Request): AdminActor => ({
  id: user.id,
  ipAddress: clientInfo(req).ipAddress,
});

/** Administrators only (role checked on the server for every route). */
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly history: HistoryService,
    private readonly wallet: WalletService,
  ) {}

  @Get('overview')
  overview(): Promise<AdminOverview> {
    return this.admin.overview();
  }

  // ─── Users ────────────────────────────────────────────────────────────────

  @Get('users')
  users(
    @Query(new ZodValidationPipe(adminUserSearchQuerySchema))
    query: z.output<typeof adminUserSearchQuerySchema>,
  ): Promise<AdminUser[]> {
    return this.admin.searchUsers(query.q, query.limit);
  }

  @Get('users/:userId')
  user(@Param('userId', idPipe) userId: string): Promise<AdminUser> {
    return this.admin.user(userId);
  }

  @Get('users/:userId/matches')
  userMatches(
    @Param('userId', idPipe) userId: string,
    @Query(pagePipe) query: PageQuery,
  ): Promise<MatchHistoryPage> {
    return this.history.matches(userId, query);
  }

  @Get('users/:userId/transactions')
  async userTransactions(
    @Param('userId', idPipe) userId: string,
    @Query(pagePipe) query: PageQuery,
  ): Promise<WalletTransactionPage> {
    await this.admin.user(userId);
    return this.wallet.transactions(userId, query);
  }

  @Patch('users/:userId/status')
  updateStatus(
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
    @Param('userId', idPipe) userId: string,
    @Body(new ZodValidationPipe(updateUserStatusRequestSchema)) body: UpdateUserStatusRequest,
  ): Promise<AdminUserStatusResponse> {
    return this.admin.updateUserStatus(actorOf(user, req), userId, body);
  }

  @Post('users/:userId/sessions/revoke')
  @HttpCode(HttpStatus.OK)
  revokeSessions(
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
    @Param('userId', idPipe) userId: string,
    @Body(new ZodValidationPipe(adminReasonRequestSchema)) body: AdminReasonRequest,
  ): Promise<{ revokedSessions: number }> {
    return this.admin.revokeSessions(actorOf(user, req), userId, body.reason);
  }

  @Post('users/:userId/adjustments')
  adjustCoins(
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
    @Param('userId', idPipe) userId: string,
    @Body(new ZodValidationPipe(adminCoinAdjustmentRequestSchema)) body: AdminCoinAdjustmentRequest,
  ): Promise<{ transactionId: string; balance: number }> {
    return this.admin.adjustCoins(actorOf(user, req), userId, body);
  }

  @Post('users/:userId/notices')
  @HttpCode(HttpStatus.NO_CONTENT)
  sendNotice(
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
    @Param('userId', idPipe) userId: string,
    @Body(new ZodValidationPipe(adminNoticeRequestSchema)) body: AdminNoticeRequest,
  ): Promise<void> {
    return this.admin.sendNotice(actorOf(user, req), userId, body);
  }

  // ─── Matches ──────────────────────────────────────────────────────────────

  @Get('matches')
  matches(
    @Query(new ZodValidationPipe(adminMatchListQuerySchema))
    query: z.output<typeof adminMatchListQuerySchema>,
  ): Promise<AdminMatchPage> {
    return this.admin.matches(query);
  }

  @Get('matches/:matchId')
  match(@Param('matchId', idPipe) matchId: string): Promise<AdminMatchDetail> {
    return this.admin.match(matchId);
  }

  @Post('matches/:matchId/flag')
  @HttpCode(HttpStatus.OK)
  flag(
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
    @Param('matchId', idPipe) matchId: string,
    @Body(new ZodValidationPipe(adminFlagMatchRequestSchema)) body: AdminFlagMatchRequest,
  ): Promise<AdminMatchDetail> {
    return this.admin.flagMatch(actorOf(user, req), matchId, body.flagged, body.reason);
  }

  @Post('matches/:matchId/abort')
  @HttpCode(HttpStatus.OK)
  abort(
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
    @Param('matchId', idPipe) matchId: string,
    @Body(new ZodValidationPipe(adminReasonRequestSchema)) body: AdminReasonRequest,
  ): Promise<AdminMatchDetail> {
    return this.admin.abortMatch(actorOf(user, req), matchId, body.reason);
  }

  // ─── Reports, presets, audit ──────────────────────────────────────────────

  @Get('reports')
  reports(
    @Query(new ZodValidationPipe(adminReportListQuerySchema))
    query: z.output<typeof adminReportListQuerySchema>,
  ): Promise<AdminReport[]> {
    return this.admin.reports(query.status);
  }

  @Post('reports/:reportId/resolve')
  @HttpCode(HttpStatus.NO_CONTENT)
  resolveReport(
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
    @Param('reportId', idPipe) reportId: string,
    @Body(new ZodValidationPipe(adminResolveReportRequestSchema)) body: AdminResolveReportRequest,
  ): Promise<void> {
    return this.admin.resolveReport(actorOf(user, req), reportId, body.status, body.reason);
  }

  @Get('rule-presets')
  rulePresets(): Promise<AdminRulePreset[]> {
    return this.admin.rulePresets();
  }

  @Post('rule-presets')
  createRulePreset(
    @CurrentUser() user: SessionUser,
    @Req() req: Request,
    @Body(new ZodValidationPipe(adminCreateRulePresetRequestSchema))
    body: AdminCreateRulePresetRequest,
  ): Promise<AdminRulePreset> {
    return this.admin.createRulePreset(actorOf(user, req), body);
  }

  @Get('audit-logs')
  auditLog(@Query(pagePipe) query: PageQuery): Promise<AdminAuditPage> {
    return this.admin.auditLog(query);
  }
}
