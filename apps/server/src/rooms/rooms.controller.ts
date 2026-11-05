import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  type CreatedInvitation,
  type CreateInvitationRequest,
  createInvitationRequestSchema,
  type CreateRoomRequest,
  createRoomRequestSchema,
  type CurrentRoom,
  type InvitationList,
  type RemoveMemberRequest,
  removeMemberRequestSchema,
  spectateByCodeRequestSchema,
  type SpectateRequest,
  spectateRequestSchema,
  type JoinRoomByCodeRequest,
  joinRoomByCodeRequestSchema,
  type JoinRoomRequest,
  joinRoomRequestSchema,
  type RoomDetail,
  type RoomListFilter,
  roomListQuerySchema,
  type RoomOptions,
  type RoomSummary,
  type SetReadyRequest,
  setReadyRequestSchema,
  type UpdateRoomSettingsRequest,
  updateRoomSettingsRequestSchema,
} from '@tienlen/shared';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { GameService } from '../game/game.service';
import { InvitationsService } from '../invitations/invitations.service';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { RoomsService } from './rooms.service';
import { SpectatorsService } from './spectators.service';

export const roomIdPipe = new ZodValidationPipe(z.uuid());
const ROOM_COMMANDS = { limit: 60, windowSeconds: 60 };
/** Invitations notify other players, so they are limited more tightly. */
export const INVITATIONS = { limit: 30, windowSeconds: 3600 };

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly spectators: SpectatorsService,
    private readonly invitations: InvitationsService,
    private readonly game: GameService,
    private readonly matchmaking: MatchmakingService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(roomListQuerySchema)) filter: RoomListFilter,
  ): Promise<RoomSummary[]> {
    return this.rooms.list(filter);
  }

  @Get('options')
  options(): Promise<RoomOptions> {
    return this.rooms.options();
  }

  /** The room the caller is seated in: the unfinished game to continue, if any. */
  @Get('current')
  current(@CurrentUser() user: SessionUser): Promise<CurrentRoom> {
    return this.rooms.current(user.id);
  }

  @Post()
  async create(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(createRoomRequestSchema)) body: CreateRoomRequest,
  ): Promise<{ roomId: string }> {
    await this.limit(user);
    await this.matchmaking.leaveQueue(user.id);
    return this.rooms.create(user.id, body);
  }

  @Post('join-by-code')
  @HttpCode(HttpStatus.OK)
  async joinByCode(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(joinRoomByCodeRequestSchema)) body: JoinRoomByCodeRequest,
  ): Promise<{ roomId: string }> {
    await this.limit(user);
    await this.matchmaking.leaveQueue(user.id);
    return this.rooms.joinByCode(user.id, body.code, body.password);
  }

  /** Watch a room by its code (spectator mode; the room must allow spectators). */
  @Post('spectate-by-code')
  @HttpCode(HttpStatus.OK)
  async spectateByCode(
    @CurrentUser() user: SessionUser,
    @Body(new ZodValidationPipe(spectateByCodeRequestSchema)) body: JoinRoomByCodeRequest,
  ): Promise<{ roomId: string }> {
    await this.limit(user);
    return this.spectators.spectateByCode(user.id, body.code, body.password);
  }

  @Get(':roomId')
  detail(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
  ): Promise<RoomDetail> {
    return this.rooms.detail(roomId, user.id);
  }

  @Post(':roomId/join')
  @HttpCode(HttpStatus.OK)
  async join(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
    @Body(new ZodValidationPipe(joinRoomRequestSchema)) body: JoinRoomRequest,
  ): Promise<{ roomId: string }> {
    await this.limit(user);
    await this.matchmaking.leaveQueue(user.id);
    return this.rooms.join(user.id, roomId, body.password);
  }

  @Put(':roomId/ready')
  async ready(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
    @Body(new ZodValidationPipe(setReadyRequestSchema)) body: SetReadyRequest,
  ): Promise<RoomDetail> {
    await this.limit(user);
    return this.rooms.setReady(user.id, roomId, body.ready);
  }

  @Patch(':roomId/settings')
  async settings(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
    @Body(new ZodValidationPipe(updateRoomSettingsRequestSchema)) body: UpdateRoomSettingsRequest,
  ): Promise<RoomDetail> {
    await this.limit(user);
    return this.rooms.updateSettings(user.id, roomId, body);
  }

  @Post(':roomId/start')
  @HttpCode(HttpStatus.OK)
  async start(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
  ): Promise<RoomDetail> {
    await this.limit(user);
    await this.game.start(roomId, user.id);
    return this.rooms.detail(roomId, user.id);
  }

  @Post(':roomId/rematch')
  @HttpCode(HttpStatus.OK)
  async rematch(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
  ): Promise<{ roomId: string }> {
    await this.limit(user);
    await this.matchmaking.leaveQueue(user.id);
    return this.rooms.rematch(user.id, roomId);
  }

  @Post(':roomId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
  ): Promise<void> {
    await this.limit(user);
    await this.rooms.leave(user.id, roomId);
  }

  /** Host-only, before the start: remove a seated player or a spectator. */
  @Post(':roomId/remove-member')
  @HttpCode(HttpStatus.OK)
  async removeMember(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
    @Body(new ZodValidationPipe(removeMemberRequestSchema)) body: RemoveMemberRequest,
  ): Promise<RoomDetail> {
    await this.limit(user);
    return this.rooms.removeMember(user.id, roomId, body.userId);
  }

  /** Host-only, before the start: close the room for everyone. */
  @Post(':roomId/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  async close(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
  ): Promise<void> {
    await this.limit(user);
    await this.rooms.close(user.id, roomId);
  }

  @Post(':roomId/spectate')
  @HttpCode(HttpStatus.OK)
  async spectate(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
    @Body(new ZodValidationPipe(spectateRequestSchema)) body: SpectateRequest,
  ): Promise<{ roomId: string }> {
    await this.limit(user);
    return this.spectators.spectate(user.id, roomId, body.password);
  }

  @Post(':roomId/spectate/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async stopSpectating(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
  ): Promise<void> {
    await this.limit(user);
    await this.spectators.leave(user.id, roomId);
  }

  /** A direct invitation (`inviteeId`) or a shareable link (no body). Seated players only. */
  @Post(':roomId/invitations')
  async invite(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
    @Body(new ZodValidationPipe(createInvitationRequestSchema)) body: CreateInvitationRequest,
  ): Promise<CreatedInvitation> {
    await this.rateLimit.enforce(`invitations:user:${user.id}`, INVITATIONS);
    return this.invitations.create(user.id, roomId, body.inviteeId);
  }

  @Get(':roomId/invitations')
  roomInvitations(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
  ): Promise<InvitationList> {
    return this.invitations.forRoom(user.id, roomId);
  }

  private limit(user: SessionUser): Promise<void> {
    return this.rateLimit.enforce(`rooms:user:${user.id}`, ROOM_COMMANDS);
  }
}
