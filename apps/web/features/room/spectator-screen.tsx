'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  classifyCombination,
  DEFAULT_GAME_RULES,
  type GameSeat,
  type RoomDetail,
} from '@tienlen/shared';
import { Eye, LogOut, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CurrentTrick } from '@/components/game/current-trick';
import { GameTable } from '@/components/game/game-table';
import { MatchResultModal } from '@/components/game/match-result-modal';
import { PlayerSeat } from '@/components/game/player-seat';
import { TurnIndicator } from '@/components/game/turn-indicator';
import { Button } from '@/components/ui/button';
import { LoadingSkeleton, QueryErrorState } from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { describeEvent } from '@/features/history/describe-event';
import { describeSeries } from '@/features/rules/series-fields';
import { errorMessage } from '@/lib/api/client';
import { showToast } from '@/lib/toast-store';
import { nameCombination } from './play-hint';

const RECENT_EVENTS = 6;

/**
 * Spectator mode: the public table from the server's spectator projection. It never holds a
 * hand: the server sends card counts only while the round is played (docs/GAME_RULES.md §21).
 * Leaving never affects the match.
 */
export function SpectatorScreen({ room }: { room: RoomDetail }) {
  const source = useDataSource();
  const router = useRouter();
  const [resultDismissed, setResultDismissed] = useState(false);
  const game = useQuery({
    queryKey: queryKeys.spectatorView(room.id),
    queryFn: () => source.getSpectatorView(room.id),
  });
  const events = useQuery({
    queryKey: queryKeys.gameEvents(room.id),
    queryFn: () => source.getGameEvents(room.id),
  });
  const finished = game.data?.status === 'FINISHED';
  const result = useQuery({
    queryKey: queryKeys.matchResult(room.id),
    queryFn: () => source.getMatchResult(room.id),
    enabled: finished,
  });
  const leave = useMutation({
    mutationFn: () => source.stopSpectating(room.id),
    onSuccess: () => router.push('/lobby'),
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });

  if (game.isPending) {
    return (
      <div className="flex h-screen-fit items-center justify-center p-6" role="status">
        <span className="sr-only">Đang tải bàn chơi</span>
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
  const count = view.seats.length;
  const seat = (index: number): GameSeat => view.seats[index % count]!;
  const placed = (index: number) => (
    <PlayerSeat seat={seat(index)} isTurn={view.turnSeat === seat(index).seatIndex} compact />
  );
  // Seat 0 sits at the bottom; the others follow in turn order (counter-clockwise).
  const layout =
    count === 2
      ? { top: placed(1) }
      : count === 3
        ? { right: placed(1), left: placed(2) }
        : { right: placed(1), top: placed(2), left: placed(3) };
  const nameOf = (index: number | null) =>
    index === null ? '' : (view.seats[index]?.displayName ?? '');
  const onTable = view.currentTrick
    ? classifyCombination(view.currentTrick.cards, view.rules ?? DEFAULT_GAME_RULES)
    : null;
  const recent = (events.data ?? []).slice(-RECENT_EVENTS).reverse();

  return (
    <>
      <GameTable
        header={
          <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 bg-felt-950/60 px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] md:px-6">
            <span className="flex items-center gap-1 rounded-full bg-sky-400/20 px-2.5 py-1 text-xs font-semibold text-sky-100">
              <Eye aria-hidden className="size-3.5" /> Khán giả
            </span>
            {finished ? null : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-red-200">
                <span aria-hidden className="size-2 animate-pulse rounded-full bg-red-400" />
                Trực tiếp
              </span>
            )}
            <h1 className="truncate text-sm font-semibold">
              {room.name ?? `Phòng ${room.code}`}
              {room.series ? (
                <span className="ml-2 font-normal text-white/60">
                  {describeSeries(room.series, room.roundNumber)}
                </span>
              ) : null}
            </h1>
            <span className="text-xs text-white/60">{view.spectatorCount} người xem</span>
            <Button
              variant="ghost"
              size="sm"
              icon={<LogOut aria-hidden className="size-4" />}
              loading={leave.isPending}
              onClick={() => leave.mutate()}
            >
              Ngừng xem
            </Button>
            <div className="ml-auto">
              <TurnIndicator
                isMyTurn={false}
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
          <CurrentTrick
            trick={view.currentTrick}
            description={onTable ? nameCombination(onTable) : null}
            playerName={nameOf}
            leaderName={view.turnSeat === null ? null : nameOf(view.turnSeat)}
          />
        }
        actions={
          <div className="flex flex-wrap items-center justify-center gap-3">
            {placed(0)}
            {finished ? (
              <Button
                variant="secondary"
                icon={<Trophy aria-hidden className="size-5" />}
                onClick={() => setResultDismissed(false)}
              >
                Xem kết quả
              </Button>
            ) : null}
          </div>
        }
        hand={
          <section
            aria-label="Diễn biến ván"
            aria-live="polite"
            className="max-h-32 overflow-y-auto rounded-xl bg-black/25 px-3 py-2 text-sm"
          >
            {recent.length === 0 ? (
              <p className="text-white/60">Chưa có nước đi nào.</p>
            ) : (
              <ol className="flex flex-col gap-0.5">
                {recent.map((event) => (
                  <li key={event.sequence} className="text-white/85">
                    {describeEvent(event, nameOf)}
                  </li>
                ))}
              </ol>
            )}
          </section>
        }
      />
      {finished && result.data ? (
        <MatchResultModal
          open={!resultDismissed}
          result={result.data}
          myUserId={null}
          playerName={(index) => nameOf(index)}
          onClose={() => setResultDismissed(true)}
        />
      ) : null}
    </>
  );
}
