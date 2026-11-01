'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import type { MatchHistoryItem } from '@tienlen/shared';
import { ChevronRight, Clock } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  EmptyState,
  LoadingRegion,
  LoadingSkeleton,
  QueryErrorState,
} from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { cn } from '@/lib/cn';
import { formatCoinDelta, formatCoins, formatDateTime } from '@/lib/format';

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} phút ${seconds % 60} giây` : `${seconds} giây`;
}

/** "Hạng 1/4", or "Đã hủy" for an aborted match. */
export function placementLabel(match: MatchHistoryItem): string {
  if (match.status === 'ABORTED') return 'Đã hủy';
  const me = match.players.find((p) => p.seatIndex === match.mySeat)!;
  return `Hạng ${me.placement}/4`;
}

export function HistoryList() {
  const source = useDataSource();
  const history = useInfiniteQuery({
    queryKey: queryKeys.history,
    queryFn: ({ pageParam }) => source.listMatchHistory(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const matches = history.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Lịch sử ván đấu</h1>
      {history.isPending ? (
        <LoadingRegion label="Đang tải lịch sử">
          <LoadingSkeleton className="h-64" />
        </LoadingRegion>
      ) : history.isError ? (
        <QueryErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="Chưa có ván đấu nào"
          description="Các ván bạn đã chơi xong sẽ xuất hiện ở đây."
        />
      ) : (
        <>
          <ul aria-label="Ván đấu" className="flex flex-col gap-2">
            {matches.map((match) => {
              const me = match.players.find((p) => p.seatIndex === match.mySeat)!;
              return (
                <li key={match.matchId}>
                  <Link
                    href={`/history/${match.matchId}`}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-felt-800/70 p-4 hover:bg-felt-700/70"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {placementLabel(match)} · {match.roomName ?? `Phòng ${match.roomCode}`}
                      </p>
                      <p className="text-xs text-white/60">
                        {formatDateTime(match.startedAt)} · {formatDuration(match.durationSeconds)}
                        {match.entryFee > 0 ? ` · Cược ${formatCoins(match.entryFee)} xu` : ''}
                      </p>
                    </div>
                    {me.coinDelta !== null && match.entryFee > 0 ? (
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          me.coinDelta >= 0 ? 'text-emerald-300' : 'text-red-300',
                        )}
                      >
                        {formatCoinDelta(me.coinDelta)} xu
                      </span>
                    ) : null}
                    <ChevronRight aria-hidden className="size-5 text-white/50" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {history.hasNextPage ? (
            <Button
              variant="secondary"
              loading={history.isFetchingNextPage}
              onClick={() => void history.fetchNextPage()}
            >
              Xem thêm
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
