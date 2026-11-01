'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { LeaderboardMetric, LeaderboardPeriod } from '@tienlen/shared';
import { Trophy } from 'lucide-react';
import { useState } from 'react';
import {
  EmptyState,
  LoadingRegion,
  LoadingSkeleton,
  QueryErrorState,
} from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { LeaderboardTable } from './leaderboard-table';

const BOARDS: { metric: LeaderboardMetric; period: LeaderboardPeriod; label: string }[] = [
  { metric: 'wins', period: 'week', label: 'Thắng trong tuần' },
  { metric: 'wins', period: 'all', label: 'Tổng số trận thắng' },
  { metric: 'winRate', period: 'all', label: 'Tỉ lệ thắng' },
  { metric: 'played', period: 'all', label: 'Số ván đã chơi' },
];

/** Rankings computed by the server from finished matches only. */
export function LeaderboardView() {
  const source = useDataSource();
  const [selected, setSelected] = useState(0);
  const { metric, period, label } = BOARDS[selected]!;
  const board = useQuery({
    queryKey: queryKeys.leaderboard(metric, period),
    queryFn: () => source.getLeaderboard({ metric, period, limit: 50 }),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Bảng xếp hạng</h1>
      <div role="tablist" aria-label="Loại bảng xếp hạng" className="flex flex-wrap gap-2">
        {BOARDS.map((b, i) => (
          <button
            key={b.label}
            type="button"
            role="tab"
            aria-selected={i === selected}
            onClick={() => setSelected(i)}
            className={cn(
              'min-h-11 rounded-full px-4 text-sm font-medium',
              i === selected ? 'bg-gold-400 text-felt-950' : 'bg-white/10 hover:bg-white/15',
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
      <section
        role="tabpanel"
        aria-label={label}
        className="rounded-2xl border border-white/10 bg-felt-800/70 p-5"
      >
        {board.isPending ? (
          <LoadingRegion label="Đang tải bảng xếp hạng">
            <LoadingSkeleton className="h-64" />
          </LoadingRegion>
        ) : board.isError ? (
          <QueryErrorState error={board.error} onRetry={() => void board.refetch()} />
        ) : (
          <>
            <p className="mb-3 text-xs text-white/60">
              {board.data.since
                ? `Tính từ ${formatDate(board.data.since)} (thứ Hai, giờ Việt Nam). `
                : 'Toàn thời gian. '}
              Chỉ tính các ván đã kết thúc hợp lệ.
              {board.data.minMatches > 0
                ? ` Cần ít nhất ${board.data.minMatches} ván để được xếp hạng tỉ lệ thắng.`
                : ''}
            </p>
            {board.data.entries.length === 0 ? (
              <EmptyState icon={Trophy} title="Chưa có ai được xếp hạng" />
            ) : (
              <LeaderboardTable
                entries={board.data.entries}
                caption={label}
                detailed
                highlightUserId={board.data.me?.userId}
              />
            )}
            {board.data.me &&
            !board.data.entries.some((e) => e.userId === board.data.me?.userId) ? (
              <p className="mt-3 text-sm text-white/80">
                Hạng của bạn: <strong>{board.data.me.rank}</strong>
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
