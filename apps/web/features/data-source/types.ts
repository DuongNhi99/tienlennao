import type {
  CardId,
  CreateReportRequest,
  CreateRoomRequest,
  CurrentUserSummary,
  DailyRewardStatus,
  JoinRoomByCodeRequest,
  Leaderboard,
  LeaderboardEntry,
  LeaderboardQuery,
  MatchHistoryDetail,
  MatchHistoryPage,
  MatchmakingStatus,
  MatchResult,
  NotificationPage,
  PlayerGameView,
  RoomDetail,
  RoomListFilter,
  RoomOptions,
  RoomSummary,
  WalletSummary,
  WalletTransactionPage,
} from '@tienlen/shared';

/**
 * Server-push notifications (Socket.IO in production). The UI only uses them to refetch
 * authoritative state, never as a source of truth themselves. `resync` follows a reconnect:
 * anything may have changed while offline, so everything is refetched.
 */
export type DataSourceEvent =
  | { type: 'user' }
  | { type: 'rooms' }
  | { type: 'room'; roomId: string }
  | { type: 'game'; roomId: string }
  | { type: 'matchmaking' }
  | { type: 'notifications' }
  | { type: 'resync' };

export interface GameAction {
  roomId: string;
  /** The state version the client acted on; stale actions are rejected (STALE_STATE). */
  stateVersion: number;
  /** Client-generated idempotency key; retries with the same ID are processed once. */
  actionId: string;
}

/**
 * Everything the authenticated screens need from the backend. Every method resolves with data
 * validated against the shared contracts or rejects with an ApiClientError.
 */
export interface GameDataSource {
  readonly kind: 'preview' | 'api';
  subscribe(listener: (event: DataSourceEvent) => void): () => void;

  getCurrentUser(): Promise<CurrentUserSummary>;

  listRooms(filter: RoomListFilter): Promise<RoomSummary[]>;
  getRoomOptions(): Promise<RoomOptions>;
  createRoom(input: CreateRoomRequest): Promise<{ roomId: string }>;
  joinRoom(roomId: string, password?: string): Promise<{ roomId: string }>;
  joinRoomByCode(input: JoinRoomByCodeRequest): Promise<{ roomId: string }>;
  getRoom(roomId: string): Promise<RoomDetail>;
  setReady(roomId: string, ready: boolean): Promise<RoomDetail>;
  updateRoomSettings(
    roomId: string,
    settings: { entryFee: number; turnTimerSeconds: number },
  ): Promise<RoomDetail>;
  startMatch(roomId: string): Promise<RoomDetail>;
  leaveRoom(roomId: string): Promise<void>;

  getGameView(roomId: string): Promise<PlayerGameView>;
  playCards(action: GameAction & { cards: CardId[] }): Promise<PlayerGameView>;
  pass(action: GameAction): Promise<PlayerGameView>;
  getMatchResult(roomId: string): Promise<MatchResult>;

  getMatchmakingStatus(): Promise<MatchmakingStatus>;
  joinMatchmaking(entryFee: number): Promise<MatchmakingStatus>;
  cancelMatchmaking(): Promise<MatchmakingStatus>;

  /** Top 5 by weekly wins, for the lobby. */
  getLeaderboardPreview(): Promise<LeaderboardEntry[]>;
  getLeaderboard(query: LeaderboardQuery): Promise<Leaderboard>;
  listMatchHistory(cursor?: string): Promise<MatchHistoryPage>;
  getMatchHistory(matchId: string): Promise<MatchHistoryDetail>;
  reportPlayer(report: CreateReportRequest): Promise<{ reportId: string }>;
  getWallet(): Promise<WalletSummary>;
  /** Newest first; pass the previous page's `nextCursor` for older entries. */
  listWalletTransactions(cursor?: string): Promise<WalletTransactionPage>;
  getDailyReward(): Promise<DailyRewardStatus>;
  claimDailyReward(): Promise<{ amount: number; balance: number }>;
  /** Newest first, with the unread count; pass `nextCursor` for older ones. */
  listNotifications(cursor?: string): Promise<NotificationPage>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(): Promise<void>;
}
