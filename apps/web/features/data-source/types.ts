import type {
  CardId,
  CreateRoomRequest,
  CurrentUserSummary,
  DailyRewardStatus,
  JoinRoomByCodeRequest,
  LeaderboardEntry,
  MatchmakingStatus,
  MatchResult,
  NotificationItem,
  PlayerGameView,
  RoomDetail,
  RoomListFilter,
  RoomOptions,
  RoomSummary,
} from '@tienlen/shared';

/**
 * Server-push notifications. In production these map to Socket.IO events (Phase 5); the UI only
 * uses them to refetch authoritative state, never as a source of truth themselves.
 */
export type DataSourceEvent =
  | { type: 'user' }
  | { type: 'rooms' }
  | { type: 'room'; roomId: string }
  | { type: 'game'; roomId: string }
  | { type: 'matchmaking' }
  | { type: 'notifications' };

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

  getLeaderboardPreview(): Promise<LeaderboardEntry[]>;
  getDailyReward(): Promise<DailyRewardStatus>;
  claimDailyReward(): Promise<{ amount: number; balance: number }>;
  listNotifications(): Promise<NotificationItem[]>;
  markAllNotificationsRead(): Promise<void>;
}
