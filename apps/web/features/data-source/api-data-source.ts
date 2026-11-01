import {
  type ClientToServerEvents,
  currentUserSummarySchema,
  dailyRewardClaimSchema,
  dailyRewardStatusSchema,
  ERROR_MESSAGES_VI,
  matchmakingStatusSchema,
  matchResultSchema,
  playerGameViewSchema,
  roomDetailSchema,
  roomOptionsSchema,
  roomSummarySchema,
  type ServerToClientEvents,
  SOCKET_IO_PATH,
  walletSummarySchema,
  walletTransactionPageSchema,
} from '@tienlen/shared';
import { io, type Socket } from 'socket.io-client';
import { z } from 'zod';
import { ApiClientError, apiRequest, noContentSchema } from '@/lib/api/client';
import { publicEnv } from '@/lib/env';
import type { DataSourceEvent, GameDataSource } from './types';

/**
 * The real backend. Leaderboard and notifications (Phase 7) are not served yet: those methods
 * reject with FEATURE_UNAVAILABLE so screens say "coming soon" instead of inventing data.
 */
function unavailable(): Promise<never> {
  return Promise.reject(
    new ApiClientError('FEATURE_UNAVAILABLE', ERROR_MESSAGES_VI.FEATURE_UNAVAILABLE, 501),
  );
}

const roomIdResponseSchema = z.object({ roomId: z.uuid() });
const room = (roomId: string) => `/rooms/${encodeURIComponent(roomId)}`;

/**
 * Server notifications (Socket.IO, authenticated by the session cookie) become data-source
 * events. They only say what changed; screens refetch through REST. After a reconnect every
 * query is refreshed, because notifications sent while offline are lost.
 */
function createNotifications() {
  const listeners = new Set<(event: DataSourceEvent) => void>();
  let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  const emit = (event: DataSourceEvent) => listeners.forEach((listener) => listener(event));

  function open() {
    const next: Socket<ServerToClientEvents, ClientToServerEvents> = io(
      new URL(publicEnv.NEXT_PUBLIC_API_URL).origin,
      { path: SOCKET_IO_PATH, withCredentials: true },
    );
    let connectedBefore = false;
    next.on('connect', () => {
      if (connectedBefore) emit({ type: 'resync' });
      connectedBefore = true;
    });
    next.on('rooms:changed', () => emit({ type: 'rooms' }));
    next.on('room:updated', ({ roomId }) => emit({ type: 'room', roomId }));
    next.on('game:updated', ({ roomId }) => emit({ type: 'game', roomId }));
    next.on('matchmaking:updated', () => emit({ type: 'matchmaking' }));
    next.on('user:updated', () => emit({ type: 'user' }));
    return next;
  }

  return (listener: (event: DataSourceEvent) => void) => {
    listeners.add(listener);
    socket ??= open();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        socket?.close();
        socket = null;
      }
    };
  };
}

export function createApiDataSource(): GameDataSource {
  return {
    kind: 'api',
    subscribe: createNotifications(),

    getCurrentUser: () => apiRequest('/users/me', { schema: currentUserSummarySchema }),

    listRooms: (filter) => {
      const query = new URLSearchParams();
      if (filter.maxEntryFee !== undefined) query.set('maxEntryFee', String(filter.maxEntryFee));
      if (filter.onlyWithSeats) query.set('onlyWithSeats', 'true');
      const search = query.toString();
      return apiRequest(`/rooms${search ? `?${search}` : ''}`, {
        schema: roomSummarySchema.array(),
      });
    },
    getRoomOptions: () => apiRequest('/rooms/options', { schema: roomOptionsSchema }),
    createRoom: (input) =>
      apiRequest('/rooms', { method: 'POST', body: input, schema: roomIdResponseSchema }),
    joinRoom: (roomId, password) =>
      apiRequest(`${room(roomId)}/join`, {
        method: 'POST',
        body: { password },
        schema: roomIdResponseSchema,
      }),
    joinRoomByCode: (input) =>
      apiRequest('/rooms/join-by-code', {
        method: 'POST',
        body: input,
        schema: roomIdResponseSchema,
      }),
    getRoom: (roomId) => apiRequest(room(roomId), { schema: roomDetailSchema }),
    setReady: (roomId, ready) =>
      apiRequest(`${room(roomId)}/ready`, {
        method: 'PUT',
        body: { ready },
        schema: roomDetailSchema,
      }),
    updateRoomSettings: (roomId, settings) =>
      apiRequest(`${room(roomId)}/settings`, {
        method: 'PATCH',
        body: settings,
        schema: roomDetailSchema,
      }),
    startMatch: (roomId) =>
      apiRequest(`${room(roomId)}/start`, { method: 'POST', schema: roomDetailSchema }),
    leaveRoom: async (roomId) => {
      await apiRequest(`${room(roomId)}/leave`, { method: 'POST', schema: noContentSchema });
    },

    getGameView: (roomId) => apiRequest(`${room(roomId)}/game`, { schema: playerGameViewSchema }),
    playCards: ({ roomId, ...action }) =>
      apiRequest(`${room(roomId)}/game/play`, {
        method: 'POST',
        body: action,
        schema: playerGameViewSchema,
      }),
    pass: ({ roomId, ...action }) =>
      apiRequest(`${room(roomId)}/game/pass`, {
        method: 'POST',
        body: action,
        schema: playerGameViewSchema,
      }),
    getMatchResult: (roomId) =>
      apiRequest(`${room(roomId)}/game/result`, { schema: matchResultSchema }),

    getMatchmakingStatus: () => apiRequest('/matchmaking', { schema: matchmakingStatusSchema }),
    joinMatchmaking: (entryFee) =>
      apiRequest('/matchmaking', {
        method: 'POST',
        body: { entryFee },
        schema: matchmakingStatusSchema,
      }),
    cancelMatchmaking: () =>
      apiRequest('/matchmaking', { method: 'DELETE', schema: matchmakingStatusSchema }),

    getLeaderboardPreview: unavailable,
    getWallet: () => apiRequest('/wallet', { schema: walletSummarySchema }),
    listWalletTransactions: (cursor) =>
      apiRequest(`/wallet/transactions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {
        schema: walletTransactionPageSchema,
      }),
    getDailyReward: () => apiRequest('/rewards/daily', { schema: dailyRewardStatusSchema }),
    claimDailyReward: () =>
      apiRequest('/rewards/daily/claim', { method: 'POST', schema: dailyRewardClaimSchema }),
    listNotifications: unavailable,
    markAllNotificationsRead: unavailable,
  };
}
