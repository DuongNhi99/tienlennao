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
  type CreateRoomRequest,
  createRoomRequestSchema,
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
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { RoomsService } from './rooms.service';

export const roomIdPipe = new ZodValidationPipe(z.uuid());
const ROOM_COMMANDS = { limit: 60, windowSeconds: 60 };

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
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

  @Post(':roomId/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(
    @CurrentUser() user: SessionUser,
    @Param('roomId', roomIdPipe) roomId: string,
  ): Promise<void> {
    await this.limit(user);
    await this.rooms.leave(user.id, roomId);
  }

  private limit(user: SessionUser): Promise<void> {
    return this.rateLimit.enforce(`rooms:user:${user.id}`, ROOM_COMMANDS);
  }
}
