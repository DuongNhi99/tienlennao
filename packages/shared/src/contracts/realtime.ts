import { z } from 'zod';
import { API_PREFIX } from '../constants/api';
import { matchmakingStatusSchema } from './lobby';

/**
 * Socket.IO contract (Phase 5).
 *
 * The socket is a server→client notification channel. Commands (create, join, ready, play,
 * pass…) are REST calls: they get HTTP status codes, the CSRF origin check and rate limits,
 * and each game action already carries an idempotency key and a state version. Notifications
 * never contain private data such as hands: they say what changed, and each client refetches
 * its own player-specific view over REST.
 *
 * Connections authenticate with the session cookie during the handshake; a connection
 * without a valid session is refused.
 */

/** Served under the API prefix so one reverse-proxy rule covers REST and WebSocket. */
export const SOCKET_IO_PATH = `/${API_PREFIX}/socket.io`;

export const roomUpdatedEventSchema = z.object({ roomId: z.uuid() });
export type RoomUpdatedEvent = z.infer<typeof roomUpdatedEventSchema>;

export const gameUpdatedEventSchema = z.object({
  roomId: z.uuid(),
  matchId: z.uuid(),
  /**
   * The match's current version. A player connecting or disconnecting changes the view without
   * a new version, so clients refetch on every notification rather than compare versions.
   */
  stateVersion: z.number().int().nonnegative(),
});
export type GameUpdatedEvent = z.infer<typeof gameUpdatedEventSchema>;

export const matchmakingUpdatedEventSchema = z.object({ status: matchmakingStatusSchema });
export type MatchmakingUpdatedEvent = z.infer<typeof matchmakingUpdatedEventSchema>;

export type EmptyEvent = Record<string, never>;

/** Event names and payloads, for typed Socket.IO servers and clients. */
export interface ServerToClientEvents {
  /** The public room list changed (sent to every connected user). */
  'rooms:changed': (event: EmptyEvent) => void;
  /** Seats, readiness, connection, settings or status of a room you are in changed. */
  'room:updated': (event: RoomUpdatedEvent) => void;
  /** The match in a room you play in moved to a new state version. */
  'game:updated': (event: GameUpdatedEvent) => void;
  /** Your quick-match search changed (matched or cancelled). */
  'matchmaking:updated': (event: MatchmakingUpdatedEvent) => void;
  /** Your profile or statistics changed (for example after a match). */
  'user:updated': (event: EmptyEvent) => void;
}

/** No client→server events: commands use REST. */
export type ClientToServerEvents = Record<string, never>;
