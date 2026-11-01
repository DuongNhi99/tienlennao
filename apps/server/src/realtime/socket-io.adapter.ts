import type { IncomingMessage } from 'node:http';
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { SOCKET_IO_PATH } from '@tienlen/shared';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO served under the API prefix, with the same allowed origins as REST CORS.
 * Handshakes that carry a foreign Origin are refused outright (cross-site WebSocket
 * hijacking), before the session cookie is even looked at.
 */
export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly allowedOrigins: readonly string[],
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const origins = new Set(this.allowedOrigins);
    return super.createIOServer(port, {
      ...options,
      path: SOCKET_IO_PATH,
      serveClient: false,
      cors: { origin: [...origins], credentials: true },
      allowRequest: (req: IncomingMessage, callback: (err: string | null, ok: boolean) => void) => {
        const origin = req.headers.origin;
        callback(null, origin === undefined || origins.has(origin));
      },
    });
  }
}
