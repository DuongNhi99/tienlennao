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
  private readonly writes = new Map<string, Promise<void>>();
  private server: RealtimeServer | null = null;

  constructor(
    private readonly sessions: SessionsService,
    private readonly realtime: RealtimeService,
    private readonly rooms: RoomsService,
  ) {}

  afterInit(server: RealtimeServer): void {
    this.server = server;
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
    await this.recordConnection(userId);
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const { userId } = socket.data as Partial<SocketData>;
    if (userId) await this.recordConnection(userId);
  }

  /** True while the user has a socket on any API instance (cluster-wide with the Redis adapter). */
  private async isOnline(userId: string): Promise<boolean> {
    const sockets = await this.server?.in(userChannel(userId)).fetchSockets();
    return (sockets?.length ?? 0) > 0;
  }

  /**
   * Writes the user's presence to their seat. Writes for one user run one after another and
   * each records the presence at the time it runs, so the last write always matches reality,
   * however quickly connections open and close.
   */
  private recordConnection(userId: string): Promise<void> {
    const run = (this.writes.get(userId) ?? Promise.resolve())
      .then(async () => this.rooms.setConnected(userId, await this.isOnline(userId)))
      .catch((error: unknown) =>
        this.logger.warn(`Could not record connection change: ${describeError(error)}`),
      );
    this.writes.set(userId, run);
    void run.then(() => {
      if (this.writes.get(userId) === run) this.writes.delete(userId);
    });
    return run;
  }
}
