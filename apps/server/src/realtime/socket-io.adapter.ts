import type { IncomingMessage } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { SOCKET_IO_PATH } from '@tienlen/shared';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO served under the API prefix, with the same allowed origins as REST CORS.
 * Handshakes that carry a foreign Origin are refused outright (cross-site WebSocket
 * hijacking), before the session cookie is even looked at.
 *
 * With `redisUrl` (SOCKET_IO_REDIS_ADAPTER=true), notifications and presence lookups reach
 * sockets connected to every API instance. Without it, they reach this instance only, which is
 * correct for a single instance.
 */
export class SocketIoAdapter extends IoAdapter {
  private readonly redisClients: Redis[] = [];

  constructor(
    app: INestApplicationContext,
    private readonly allowedOrigins: readonly string[],
    private readonly redisUrl?: string,
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const origins = new Set(this.allowedOrigins);
    const server = super.createIOServer(port, {
      ...options,
      path: SOCKET_IO_PATH,
      serveClient: false,
      cors: { origin: [...origins], credentials: true },
      allowRequest: (req: IncomingMessage, callback: (err: string | null, ok: boolean) => void) => {
        const origin = req.headers.origin;
        callback(null, origin === undefined || origins.has(origin));
      },
    }) as Server;
    if (this.redisUrl) {
      const pub = new Redis(this.redisUrl);
      const sub = pub.duplicate();
      this.redisClients.push(pub, sub);
      server.adapter(createAdapter(pub, sub));
    }
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await Promise.all(this.redisClients.map((client) => client.quit().catch(() => undefined)));
  }
}
