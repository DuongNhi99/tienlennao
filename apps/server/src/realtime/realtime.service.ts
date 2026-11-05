import { Injectable } from '@nestjs/common';
import type {
  ClientToServerEvents,
  GameUpdatedEvent,
  MatchmakingStatus,
  ServerToClientEvents,
} from '@tienlen/shared';
import type { Server } from 'socket.io';

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** Socket.IO room that holds every connection of one user. */
export const userChannel = (userId: string) => `user:${userId}`;

/** Socket.IO room of everyone watching a game room as a spectator. */
export const spectatorChannel = (roomId: string) => `spectate:${roomId}`;

/**
 * Sends notifications to connected users. Services call it after their transaction commits.
 * Payloads only name what changed (never hands or other private data); recipients refetch
 * their own view — spectators their public view. Before the gateway starts (or in tests without
 * sockets) calls are no-ops.
 */
@Injectable()
export class RealtimeService {
  private server: RealtimeServer | null = null;

  attach(server: RealtimeServer): void {
    this.server = server;
  }

  roomsChanged(): void {
    this.server?.emit('rooms:changed', {});
  }

  /** To the users named and to the room's spectators. */
  roomUpdated(roomId: string, userIds: readonly string[]): void {
    this.server?.to([...userIds.map(userChannel), spectatorChannel(roomId)]).emit('room:updated', {
      roomId,
    });
  }

  /** To the users named and to the room's spectators. */
  gameUpdated(event: GameUpdatedEvent, userIds: readonly string[]): void {
    this.server
      ?.to([...userIds.map(userChannel), spectatorChannel(event.roomId)])
      .emit('game:updated', event);
  }

  matchmakingUpdated(userId: string, status: MatchmakingStatus): void {
    this.server?.to(userChannel(userId)).emit('matchmaking:updated', { status });
  }

  userUpdated(userIds: readonly string[]): void {
    if (userIds.length) this.server?.to(userIds.map(userChannel)).emit('user:updated', {});
  }

  notificationCreated(userIds: readonly string[]): void {
    if (userIds.length) this.server?.to(userIds.map(userChannel)).emit('notification:new', {});
  }

  /** Every open connection of the user (on any instance) starts receiving the room's updates. */
  joinSpectators(userId: string, roomId: string): void {
    this.server?.in(userChannel(userId)).socketsJoin(spectatorChannel(roomId));
  }

  leaveSpectators(userId: string, roomId: string): void {
    this.server?.in(userChannel(userId)).socketsLeave(spectatorChannel(roomId));
  }
}
