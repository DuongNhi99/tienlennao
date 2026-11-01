'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CardId,
  type CardSortMode,
  classifyCombination,
  DEFAULT_GAME_RULES,
  describeCombination,
  type GameSeat,
  PLAYERS_PER_MATCH,
  type RoomDetail,
  sortCards,
} from '@tienlen/shared';
import { ArrowUpDown, Trophy, X } from 'lucide-react';
import { useState } from 'react';
import { CardHand } from '@/components/game/card-hand';
import { CurrentTrick } from '@/components/game/current-trick';
import { GameTable } from '@/components/game/game-table';
import { MatchResultModal } from '@/components/game/match-result-modal';
import { PlayerSeat } from '@/components/game/player-seat';
import { TurnIndicator } from '@/components/game/turn-indicator';
import { Button, ButtonLink } from '@/components/ui/button';
import { QueryErrorState, LoadingSkeleton } from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { ApiClientError, errorMessage } from '@/lib/api/client';
import { formatCoins } from '@/lib/format';
import { showToast } from '@/lib/toast-store';

/**
 * Connects the game table to authoritative state. Card selection and sort order are local UI
 * state; every action is sent with the state version and an action ID, and the server's
 * response (or a refetch) replaces local state. The client never decides legality.
 */
export function GameScreen({ room }: { room: RoomDetail }) {
  const source = useDataSource();
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<ReadonlySet<CardId>>(new Set());
  const [sortMode, setSortMode] = useState<CardSortMode>('rank');
  const [resultDismissed, setResultDismissed] = useState(false);

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
  const seatAt = (offset: number): GameSeat =>
    view.seats[(view.mySeat + offset) % PLAYERS_PER_MATCH]!;
  const nameOf = (seatIndex: number) =>
    seatIndex === view.mySeat ? 'Bạn' : (view.seats[seatIndex]?.displayName ?? '');
  const isMyTurn = view.turnSeat === view.mySeat;
  const busy = play.isPending || pass.isPending;
  const me = view.seats[view.mySeat]!;
  // Whether the cards form a combination does not depend on configurable rules, so this hint
  // never contradicts the server. Whether they beat the table is left to the server.
  const combination = selected.size ? classifyCombination([...selected], DEFAULT_GAME_RULES) : null;
  const selectionHint = me.hasPassed
    ? 'Bạn đã bỏ lượt vòng này'
    : selected.size === 0
      ? '0 lá đã chọn'
      : combination
        ? `${describeCombination(combination)} · ${selected.size} lá`
        : 'Không phải bộ hợp lệ';

  const toggle = (card: CardId) => {
    const next = new Set(selected);
    if (next.has(card)) next.delete(card);
    else next.add(card);
    setSelection(next);
  };
  const clearSelection = () => setSelection(new Set());

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
        right={
          <PlayerSeat seat={seatAt(1)} isTurn={view.turnSeat === seatAt(1).seatIndex} compact />
        }
        top={<PlayerSeat seat={seatAt(2)} isTurn={view.turnSeat === seatAt(2).seatIndex} compact />}
        left={
          <PlayerSeat seat={seatAt(3)} isTurn={view.turnSeat === seatAt(3).seatIndex} compact />
        }
        center={
          <CurrentTrick
            trick={view.currentTrick}
            playerName={nameOf}
            leaderName={view.turnSeat === null ? null : nameOf(view.turnSeat)}
          />
        }
        actions={
          finished ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
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
              <p className="hidden text-sm text-white/70 sm:block" aria-live="polite">
                {selectionHint}
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
                  disabled={!isMyTurn || !combination || busy}
                  loading={play.isPending}
                  onClick={() => play.mutate(sortCards([...selected]))}
                  className="min-w-24"
                >
                  Đánh{selected.size > 0 ? ` (${selected.size})` : ''}
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
      {finished && result.data ? (
        <MatchResultModal
          open={!resultDismissed}
          result={result.data}
          myUserId={me.userId}
          onClose={() => setResultDismissed(true)}
        />
      ) : null}
    </>
  );
}
