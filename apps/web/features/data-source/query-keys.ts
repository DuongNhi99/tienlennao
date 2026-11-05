import type { RoomListFilter } from '@tienlen/shared';

export const queryKeys = {
  currentUser: ['current-user'] as const,
  rooms: (filter?: RoomListFilter) =>
    filter ? (['rooms', filter] as const) : (['rooms'] as const),
  roomOptions: ['room-options'] as const,
  currentRoom: ['current-room'] as const,
  room: (roomId: string) => ['room', roomId] as const,
  game: (roomId: string) => ['game', roomId] as const,
  matchResult: (roomId: string) => ['match-result', roomId] as const,
  matchmaking: ['matchmaking'] as const,
  leaderboardPreview: ['leaderboard-preview'] as const,
  leaderboard: (metric: string, period: string, search = '') =>
    ['leaderboard', metric, period, search] as const,
  history: ['history'] as const,
  historyMatch: (matchId: string) => ['history', matchId] as const,
  dailyReward: ['daily-reward'] as const,
  wallet: ['wallet'] as const,
  walletTransactions: ['wallet-transactions'] as const,
  notifications: ['notifications'] as const,
  spectatorView: (roomId: string) => ['spectator-view', roomId] as const,
  gameEvents: (roomId: string) => ['game-events', roomId] as const,
  roomInvitations: (roomId: string) => ['room-invitations', roomId] as const,
  invitations: ['invitations'] as const,
  invitationLink: (token: string) => ['invitation-link', token] as const,
  playerSearch: (query: string) => ['player-search', query] as const,
  series: (seriesId: string) => ['series', seriesId] as const,
  statistics: ['statistics'] as const,
  achievements: ['achievements'] as const,
  profile: (userId: string) => ['profile', userId] as const,
};
