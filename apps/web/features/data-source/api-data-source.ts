import { currentUserSummarySchema, ERROR_MESSAGES_VI } from '@tienlen/shared';
import { ApiClientError, apiRequest } from '@/lib/api/client';
import type { GameDataSource } from './types';

/**
 * The real backend. Rooms and matches (Phase 5), wallet rewards (Phase 6), and leaderboard
 * and notifications (Phase 7) do not exist on the server yet: those methods reject with
 * FEATURE_UNAVAILABLE so screens say "coming soon" instead of showing invented data.
 */
function unavailable(): Promise<never> {
  return Promise.reject(
    new ApiClientError('FEATURE_UNAVAILABLE', ERROR_MESSAGES_VI.FEATURE_UNAVAILABLE, 501),
  );
}

export function createApiDataSource(): GameDataSource {
  return {
    kind: 'api',
    // Server push (Socket.IO) arrives with rooms in Phase 5.
    subscribe: () => () => undefined,

    getCurrentUser: () => apiRequest('/users/me', { schema: currentUserSummarySchema }),

    listRooms: unavailable,
    getRoomOptions: unavailable,
    createRoom: unavailable,
    joinRoom: unavailable,
    joinRoomByCode: unavailable,
    getRoom: unavailable,
    setReady: unavailable,
    updateRoomSettings: unavailable,
    startMatch: unavailable,
    leaveRoom: unavailable,

    getGameView: unavailable,
    playCards: unavailable,
    pass: unavailable,
    getMatchResult: unavailable,

    getMatchmakingStatus: unavailable,
    joinMatchmaking: unavailable,
    cancelMatchmaking: unavailable,

    getLeaderboardPreview: unavailable,
    getDailyReward: unavailable,
    claimDailyReward: unavailable,
    listNotifications: unavailable,
    markAllNotificationsRead: unavailable,
  };
}
