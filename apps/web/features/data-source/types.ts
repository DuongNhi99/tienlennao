import type {
  AchievementItem,
  CardId,
  CreatedInvitation,
  CreateReportRequest,
  CreateRoomInput,
  CurrentRoom,
  CurrentUserSummary,
  DailyRewardStatus,
  Invitation,
  InvitationList,
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
  PlayerStatistics,
  ProfileVisibility,
  PublicPlayer,
  PublicProfile,
  RoomDetail,
  RoomListFilter,
  RoomOptions,
  RoomSummary,
  SeriesDetail,
  SpectatorGameView,
  TimelineEvent,
  UpdateRoomSettingsInput,
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
  createRoom(input: CreateRoomInput): Promise<{ roomId: string }>;
  joinRoom(roomId: string, password?: string): Promise<{ roomId: string }>;
  joinRoomByCode(input: JoinRoomByCodeRequest): Promise<{ roomId: string }>;
  /** The room the player is seated in: the unfinished game to continue, if any. */
  getCurrentRoom(): Promise<CurrentRoom>;
  getRoom(roomId: string): Promise<RoomDetail>;
  setReady(roomId: string, ready: boolean): Promise<RoomDetail>;
  /** Host-only, before the start. Omitted optional fields keep their value. */
  updateRoomSettings(roomId: string, settings: UpdateRoomSettingsInput): Promise<RoomDetail>;
  /** Host-only: remove a seated player or a spectator (they cannot come back). */
  removeMember(roomId: string, userId: string): Promise<RoomDetail>;
  /** Host-only, before the start: cancels the room for everyone. */
  closeRoom(roomId: string): Promise<void>;
  startMatch(roomId: string): Promise<RoomDetail>;
  /** After a finished match: opens (or joins) the "play again" / next-round room. */
  rematch(roomId: string): Promise<{ roomId: string }>;
  leaveRoom(roomId: string): Promise<void>;

  spectate(roomId: string, password?: string): Promise<{ roomId: string }>;
  spectateByCode(input: JoinRoomByCodeRequest): Promise<{ roomId: string }>;
  stopSpectating(roomId: string): Promise<void>;
  /** The public projection of a match, for spectators (no hands while it is played). */
  getSpectatorView(roomId: string): Promise<SpectatorGameView>;
  /** Public moves of the room's match after sequence `after` (players and spectators). */
  getGameEvents(roomId: string, after?: number): Promise<TimelineEvent[]>;

  getGameView(roomId: string): Promise<PlayerGameView>;
  playCards(action: GameAction & { cards: CardId[] }): Promise<PlayerGameView>;
  pass(action: GameAction): Promise<PlayerGameView>;
  getMatchResult(roomId: string): Promise<MatchResult>;

  /** A direct invitation (`inviteeId`) or a shareable link (none). */
  createInvitation(roomId: string, inviteeId?: string): Promise<CreatedInvitation>;
  listRoomInvitations(roomId: string): Promise<InvitationList>;
  /** Invitations the player received. */
  listInvitations(): Promise<InvitationList>;
  acceptInvitation(invitationId: string): Promise<{ roomId: string }>;
  rejectInvitation(invitationId: string): Promise<Invitation>;
  cancelInvitation(invitationId: string): Promise<Invitation>;
  previewInvitationLink(token: string): Promise<Invitation>;
  acceptInvitationLink(token: string): Promise<{ roomId: string }>;
  searchPlayers(query: string): Promise<PublicPlayer[]>;

  getSeries(seriesId: string): Promise<SeriesDetail>;
  finishSeries(seriesId: string): Promise<SeriesDetail>;

  getMyStatistics(): Promise<PlayerStatistics>;
  getMyAchievements(): Promise<AchievementItem[]>;
  getProfile(userId: string): Promise<PublicProfile>;
  setProfileVisibility(visibility: ProfileVisibility): Promise<PublicProfile>;

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
