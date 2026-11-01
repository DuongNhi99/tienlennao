import { Logger } from '@nestjs/common';
import {
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import { SESSION_COOKIE_NAME } from '@tienlen/shared';
import type { Socket } from 'socket.io';
import { SessionsService } from '../auth/sessions.service';
import { describeError } from '../common/errors/describe-error';
import { RoomsService } from '../rooms/rooms.service';
import { PresenceService } from './presence.service';
import { type RealtimeServer, RealtimeService, userChannel } from './realtime.service';

interface SocketData {
  userId: string;
}

/** Reads the session token from a raw Cookie header. */
export function readSessionToken(header: string | undefined): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== SESSION_COOKIE_NAME) continue;
    try {
      const value = decodeURIComponent(rest.join('='));
      return value.length > 0 && value.length <= 128 ? value : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Authenticated notification channel (contract: `contracts/realtime.ts` in @tienlen/shared).
 * The handshake must carry a valid session cookie; each connection joins its user's channel.
 * Connecting and disconnecting update the player's `connected` status in rooms and matches.
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly sessions: SessionsService,
    private readonly presence: PresenceService,
    private readonly realtime: RealtimeService,
    private readonly rooms: RoomsService,
  ) {}

  afterInit(server: RealtimeServer): void {
    this.realtime.attach(server);
    server.use((socket, next) => {
      this.authenticate(socket).then(
        () => next(),
        () => next(new Error('UNAUTHENTICATED')),
      );
    });
  }

  private async authenticate(socket: Socket): Promise<void> {
    const token = readSessionToken(socket.handshake.headers.cookie);
    if (!token) throw new Error('No session cookie');
    const session = await this.sessions.validate(token);
    if (!session || session.user.status !== 'ACTIVE') throw new Error('Invalid session');
    (socket.data as SocketData).userId = session.user.id;
  }

  async handleConnection(socket: Socket): Promise<void> {
    const { userId } = socket.data as SocketData;
    await socket.join(userChannel(userId));
    if (this.presence.connect(userId)) await this.updateConnection(userId, true);
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const { userId } = socket.data as Partial<SocketData>;
    if (userId && this.presence.disconnect(userId)) await this.updateConnection(userId, false);
  }

  private async updateConnection(userId: string, connected: boolean): Promise<void> {
    try {
      await this.rooms.setConnected(userId, connected);
    } catch (error) {
      this.logger.warn(`Could not record connection change: ${describeError(error)}`);
    }
  }
}
