import type { RoomListFilter } from '@tienlen/shared';

export const queryKeys = {
  currentUser: ['current-user'] as const,
  rooms: (filter?: RoomListFilter) =>
    filter ? (['rooms', filter] as const) : (['rooms'] as const),
  roomOptions: ['room-options'] as const,
  room: (roomId: string) => ['room', roomId] as const,
  game: (roomId: string) => ['game', roomId] as const,
  matchResult: (roomId: string) => ['match-result', roomId] as const,
  matchmaking: ['matchmaking'] as const,
  leaderboardPreview: ['leaderboard-preview'] as const,
  leaderboard: (metric: string, period: string) => ['leaderboard', metric, period] as const,
  history: ['history'] as const,
  historyMatch: (matchId: string) => ['history', matchId] as const,
  dailyReward: ['daily-reward'] as const,
  wallet: ['wallet'] as const,
  walletTransactions: ['wallet-transactions'] as const,
  notifications: ['notifications'] as const,
};
