'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { LeaderboardMetric, LeaderboardPeriod } from '@tienlen/shared';
import { Search, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/form-fields';
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

const PAGE = 50;

const METRICS: { metric: LeaderboardMetric; label: string; help: string }[] = [
  {
    metric: 'wins',
    label: 'Thắng',
    help: 'Nhiều lần về nhất nhất; bằng nhau thì ít ván hơn đứng trên.',
  },
  {
    metric: 'points',
    label: 'Tổng điểm',
    help: 'Tổng điểm ván; bằng nhau thì nhiều lần thắng hơn.',
  },
  {
    metric: 'winRate',
    label: 'Tỉ lệ thắng',
    help: 'Số ván thắng / số ván; bằng nhau thì nhiều lần thắng hơn.',
  },
  {
    metric: 'played',
    label: 'Số ván',
    help: 'Nhiều ván đã chơi nhất; bằng nhau thì nhiều lần thắng hơn.',
  },
  {
    metric: 'bestStreak',
    label: 'Chuỗi thắng',
    help: 'Chuỗi về nhất liên tiếp dài nhất trong kỳ.',
  },
  { metric: 'chops', label: 'Chặt giỏi', help: 'Nhiều lần chặt nhất; bằng nhau thì ít ván hơn.' },
  { metric: 'lowPenalty', label: 'Ít bị phạt', help: 'Điểm phạt trung bình mỗi ván thấp nhất.' },
];

const PERIODS: { period: LeaderboardPeriod; label: string }[] = [
  { period: 'today', label: 'Hôm nay' },
  { period: 'week', label: 'Tuần này' },
  { period: 'month', label: 'Tháng này' },
  { period: 'all', label: 'Toàn thời gian' },
];

/** Rankings computed by the server from finished rounds only. */
export function LeaderboardView() {
  const source = useDataSource();
  const [metric, setMetric] = useState<LeaderboardMetric>('wins');
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  // Search as the user types, without a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  const metricInfo = METRICS.find((m) => m.metric === metric)!;
  const periodLabel = PERIODS.find((p) => p.period === period)!.label;
  const label = `${metricInfo.label} · ${periodLabel}`;
  const board = useQuery({
    queryKey: [...queryKeys.leaderboard(metric, period, search), page],
    queryFn: () =>
      source.getLeaderboard({ metric, period, limit: PAGE, offset: page * PAGE, search }),
    placeholderData: keepPreviousData,
  });
  const select = (next: { metric?: LeaderboardMetric; period?: LeaderboardPeriod }) => {
    if (next.metric) setMetric(next.metric);
    if (next.period) setPeriod(next.period);
    setPage(0);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Bảng xếp hạng</h1>
      <div role="tablist" aria-label="Loại bảng xếp hạng" className="flex flex-wrap gap-2">
        {METRICS.map((m) => (
          <button
            key={m.metric}
            type="button"
            role="tab"
            aria-selected={m.metric === metric}
            onClick={() => select({ metric: m.metric })}
            className={cn(
              'min-h-11 rounded-full px-4 text-sm font-medium',
              m.metric === metric ? 'bg-gold-400 text-felt-950' : 'bg-white/10 hover:bg-white/15',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div
          role="radiogroup"
          aria-label="Khoảng thời gian"
          className="grid w-full grid-cols-4 gap-1 rounded-xl bg-black/20 p-1 sm:w-auto"
        >
          {PERIODS.map((p) => (
            <button
              key={p.period}
              type="button"
              role="radio"
              aria-checked={p.period === period}
              onClick={() => select({ period: p.period })}
              className={cn(
                'min-h-9 rounded-lg px-2 text-xs font-medium sm:px-3',
                p.period === period ? 'bg-white/20' : 'hover:bg-white/10',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <TextField
          label="Tìm người chơi"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-48 flex-1 sm:max-w-xs"
          maxLength={32}
          trailing={<Search aria-hidden className="mr-2 size-5 text-white/50" />}
        />
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
              {metricInfo.help}{' '}
              {board.data.since
                ? `Tính từ ${formatDate(board.data.since)} (giờ Việt Nam). `
                : 'Toàn thời gian. '}
              Chỉ tính các ván đã kết thúc hợp lệ.
              {board.data.minMatches > 0
                ? ` Cần ít nhất ${board.data.minMatches} ván để được xếp hạng.`
                : ''}
            </p>
            {board.data.entries.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title={search ? 'Không tìm thấy người chơi nào' : 'Chưa có ai được xếp hạng'}
              />
            ) : (
              <LeaderboardTable
                entries={board.data.entries}
                caption={label}
                detailed
                metric={metric}
                highlightUserId={board.data.me?.userId}
              />
            )}
            {board.data.total > PAGE ? (
              <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Trang trước
                </Button>
                <span className="text-white/70">
                  Trang {page + 1}/{Math.ceil(board.data.total / PAGE)}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={(page + 1) * PAGE >= board.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Trang sau
                </Button>
              </div>
            ) : null}
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
