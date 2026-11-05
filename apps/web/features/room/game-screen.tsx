'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CardId,
  type CardSortMode,
  classifyCombination,
  DEFAULT_GAME_RULES,
  type GameSeat,
  type RoomDetail,
  sortCards,
} from '@tienlen/shared';
import { ArrowUpDown, LogOut, RotateCcw, Trophy, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CardHand } from '@/components/game/card-hand';
import { CurrentTrick } from '@/components/game/current-trick';
import { GameTable } from '@/components/game/game-table';
import { LeftoverHands } from '@/components/game/leftover-hands';
import { MatchResultModal } from '@/components/game/match-result-modal';
import { PlayerSeat } from '@/components/game/player-seat';
import { TurnIndicator } from '@/components/game/turn-indicator';
import { Button, ButtonLink, type ButtonSize } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { QueryErrorState, LoadingSkeleton } from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { ApiClientError, errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatCoins } from '@/lib/format';
import { showToast } from '@/lib/toast-store';
import { nameCombination, playHint } from './play-hint';

/**
 * Connects the game table to authoritative state. Card selection and sort order are local UI
 * state; every action is sent with the state version and an action ID, and the server's
 * response (or a refetch) replaces local state. The client never decides legality.
 */
export function GameScreen({ room }: { room: RoomDetail }) {
  const source = useDataSource();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [selection, setSelection] = useState<ReadonlySet<CardId>>(new Set());
  const [sortMode, setSortMode] = useState<CardSortMode>('rank');
  const [resultDismissed, setResultDismissed] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const game = useQuery({
    queryKey: queryKeys.game(room.id),
    queryFn: () => source.getGameView(room.id),
  });
  const finished = game.data?.status === 'FINISHED';
  const result = useQuery({
    queryKey: queryKeys.matchResult(room.id),
    queryFn: () => source.getMatchResult(room.id),
    enabled: finished,
  });

  const onActionError = (error: unknown) => {
    showToast(errorMessage(error), { variant: 'error' });
    // Stale or rejected: resynchronize from the server rather than guessing.
    if (
      error instanceof ApiClientError &&
      ['STALE_STATE', 'NOT_YOUR_TURN', 'MATCH_FINISHED'].includes(error.code)
    ) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.game(room.id) });
    }
  };
  const play = useMutation({
    mutationFn: (cards: CardId[]) =>
      source.playCards({
        roomId: room.id,
        cards,
        stateVersion: game.data!.stateVersion,
        actionId: crypto.randomUUID(),
      }),
    onSuccess: (view) => queryClient.setQueryData(queryKeys.game(room.id), view),
    onError: onActionError,
  });
  const pass = useMutation({
    mutationFn: () =>
      source.pass({
        roomId: room.id,
        stateVersion: game.data!.stateVersion,
        actionId: crypto.randomUUID(),
      }),
    onSuccess: (view) => queryClient.setQueryData(queryKeys.game(room.id), view),
    onError: onActionError,
  });
  const rematch = useMutation({
    mutationFn: () => source.rematch(room.id),
    onSuccess: ({ roomId }) => router.push(`/room/${roomId}`),
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });

  if (game.isPending) {
    return (
      <div className="flex h-screen-fit items-center justify-center p-6" role="status">
        <span className="sr-only">Đang tải ván đấu</span>
        <LoadingSkeleton className="h-64 w-full max-w-3xl" />
      </div>
    );
  }
  if (game.isError) {
    return (
      <main id="main" className="mx-auto flex h-screen-fit max-w-md items-center px-6">
        <QueryErrorState
          error={game.error}
          onRetry={() => void game.refetch()}
          className="w-full"
        />
      </main>
    );
  }

  const view = game.data;
  // Players may pick cards while opponents move, so the selection survives other players'
  // actions; cards that have left the hand (played, or a new deal) drop out of it.
  const selected = new Set([...selection].filter((card) => view.myHand.includes(card)));
  // 2–4 players. Opponents in turn order: 2 → across; 3 → right, left; 4 → right, across, left.
  const playerCount = view.seats.length;
  const seatAt = (offset: number): GameSeat => view.seats[(view.mySeat + offset) % playerCount]!;
  const opponent = (offset: number) => {
    const seat = seatAt(offset);
    return <PlayerSeat seat={seat} isTurn={view.turnSeat === seat.seatIndex} compact />;
  };
  const layout =
    playerCount === 2
      ? { top: opponent(1) }
      : playerCount === 3
        ? { right: opponent(1), left: opponent(2) }
        : { right: opponent(1), top: opponent(2), left: opponent(3) };
  const nameOf = (seatIndex: number) =>
    seatIndex === view.mySeat ? 'Bạn' : (view.seats[seatIndex]?.displayName ?? '');
  const isMyTurn = view.turnSeat === view.mySeat;
  const busy = play.isPending || pass.isPending;
  const me = view.seats[view.mySeat]!;
  // After the match, opponents who still held cards show them face up; our own leftovers are
  // already visible in the hand below.
  const leftovers = view.seats
    .filter((seat) => seat.seatIndex !== view.mySeat && seat.revealedCards?.length)
    .sort((a, b) => (a.finishedPlace ?? 0) - (b.finishedPlace ?? 0));
  // The same engine check as the server's, with this match's rules: invalid plays are disabled
  // and the hint says why. The server still decides.
  const hint = playHint(view, [...selected]);
  const onTable = view.currentTrick
    ? classifyCombination(view.currentTrick.cards, view.rules ?? DEFAULT_GAME_RULES)
    : null;

  const toggle = (card: CardId) => {
    const next = new Set(selected);
    if (next.has(card)) next.delete(card);
    else next.add(card);
    setSelection(next);
  };
  const clearSelection = () => setSelection(new Set());
  // Another player may already have opened the next room; the server seats us there either way.
  const rematchButton = (size?: ButtonSize) => (
    <Button
      size={size}
      icon={<RotateCcw aria-hidden className="size-5" />}
      loading={rematch.isPending || rematch.isSuccess}
      onClick={() => rematch.mutate()}
    >
      {room.rematchRoomId ? 'Vào bàn chơi tiếp' : 'Chơi tiếp'}
    </Button>
  );

  return (
    <>
      <GameTable
        header={
          <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 bg-felt-950/60 px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] md:px-6">
            <h1 className="truncate text-sm font-semibold">
              {room.name ?? `Phòng ${room.code}`}
              <span className="ml-2 font-normal text-white/60">
                {view.entryFee === 0 ? 'Miễn phí' : `Cược ${formatCoins(view.entryFee)} xu`}
              </span>
            </h1>
            {finished ? null : (
              <Button
                variant="ghost"
                size="sm"
                icon={<LogOut aria-hidden className="size-4" />}
                onClick={() => setConfirmLeave(true)}
              >
                Rời bàn
              </Button>
            )}
            <div className="ml-auto">
              <TurnIndicator
                isMyTurn={isMyTurn}
                playerName={view.turnSeat === null ? null : nameOf(view.turnSeat)}
                deadline={view.turnDeadline}
                totalSeconds={room.turnTimerSeconds}
              />
            </div>
          </header>
        }
        right={layout.right ?? null}
        top={layout.top ?? null}
        left={layout.left ?? null}
        center={
          finished && leftovers.length ? (
            <LeftoverHands seats={leftovers} />
          ) : (
            <CurrentTrick
              trick={view.currentTrick}
              description={onTable ? nameCombination(onTable) : null}
              playerName={nameOf}
              leaderName={view.turnSeat === null ? null : nameOf(view.turnSeat)}
            />
          )
        }
        actions={
          finished ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {rematchButton()}
              <Button
                variant="secondary"
                icon={<Trophy aria-hidden className="size-5" />}
                onClick={() => setResultDismissed(false)}
              >
                Xem kết quả
              </Button>
              <ButtonLink href="/lobby" variant="secondary">
                Về sảnh
              </ButtonLink>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  'hidden text-sm sm:block',
                  selected.size > 0 && !hint.canPlay ? 'text-red-200' : 'text-white/70',
                )}
                aria-live="polite"
              >
                {hint.message}
              </p>
              <div className="ml-auto flex flex-1 justify-end gap-2 sm:flex-none">
                <Button
                  variant="ghost"
                  size="md"
                  aria-label={sortMode === 'rank' ? 'Xếp bài theo chất' : 'Xếp bài theo số'}
                  icon={<ArrowUpDown aria-hidden className="size-4" />}
                  onClick={() => setSortMode((m) => (m === 'rank' ? 'suit' : 'rank'))}
                >
                  <span className="hidden sm:inline">
                    {sortMode === 'rank' ? 'Theo chất' : 'Theo số'}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Bỏ chọn tất cả"
                  disabled={selected.size === 0}
                  icon={<X aria-hidden className="size-4" />}
                  onClick={clearSelection}
                >
                  <span className="hidden sm:inline">Bỏ chọn</span>
                </Button>
                <Button
                  variant="secondary"
                  disabled={!isMyTurn || !view.canPass || busy}
                  loading={pass.isPending}
                  onClick={() => pass.mutate()}
                >
                  Bỏ lượt
                </Button>
                <Button
                  disabled={!hint.canPlay || busy}
                  loading={play.isPending}
                  onClick={() => play.mutate(sortCards([...selected]))}
                  className="min-w-24"
                  title={hint.message || undefined}
                >
                  {hint.chop ? 'Chặt' : 'Đánh'}
                  {selected.size > 0 ? ` (${selected.size})` : ''}
                </Button>
              </div>
            </div>
          )
        }
        hand={
          <CardHand
            cards={sortCards(view.myHand, sortMode)}
            selected={selected}
            onToggle={toggle}
            disabled={finished}
          />
        }
      />
      <ConfirmDialog
        open={confirmLeave}
        title="Rời bàn khi ván chưa xong?"
        description="Ván vẫn tiếp tục khi bạn rời bàn: hết giờ, hệ thống tự bỏ lượt hoặc đánh lá nhỏ nhất thay bạn. Bạn có thể quay lại ván này từ sảnh bất cứ lúc nào."
        confirmLabel="Về sảnh"
        cancelLabel="Ở lại"
        onConfirm={() => router.push('/lobby')}
        onCancel={() => setConfirmLeave(false)}
      />
      {finished && result.data ? (
        <MatchResultModal
          open={!resultDismissed}
          result={result.data}
          myUserId={me.userId}
          playerName={nameOf}
          onClose={() => setResultDismissed(true)}
          rematch={rematchButton('lg')}
        />
      ) : null}
    </>
  );
}
