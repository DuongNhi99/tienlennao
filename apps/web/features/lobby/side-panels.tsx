'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight, Clock, Gift, Trophy } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRegion, LoadingSkeleton } from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { LeaderboardTable } from '@/features/leaderboard/leaderboard-table';
import { errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatCoins } from '@/lib/format';
import { showToast } from '@/lib/toast-store';

const STREAK_DAYS = 7;

function Panel({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: typeof Gift;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const headingId = `panel-${title.replace(/\s+/g, '-')}`;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-white/10 bg-felt-800/70 p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={headingId} className="flex items-center gap-2 font-semibold">
          <Icon aria-hidden className="size-5 text-gold-400" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DailyRewardPanel() {
  const source = useDataSource();
  const reward = useQuery({
    queryKey: queryKeys.dailyReward,
    queryFn: () => source.getDailyReward(),
  });
  const claim = useMutation({
    mutationFn: () => source.claimDailyReward(),
    onSuccess: ({ amount }) => {
      showToast(`Bạn đã nhận ${formatCoins(amount)} xu!`, { variant: 'success' });
      void reward.refetch();
    },
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });

  return (
    <Panel title="Thưởng hằng ngày" icon={Gift}>
      {reward.isPending ? (
        <LoadingRegion label="Đang tải phần thưởng">
          <LoadingSkeleton className="h-20" />
        </LoadingRegion>
      ) : reward.isError ? (
        <ErrorState message={errorMessage(reward.error)} onRetry={() => void reward.refetch()} />
      ) : (
        <div className="flex flex-col gap-3">
          <ol
            aria-label={`Chuỗi đăng nhập: ngày ${reward.data.streakDay} trên ${STREAK_DAYS}`}
            className="flex gap-1.5"
          >
            {Array.from({ length: STREAK_DAYS }, (_, i) => {
              const day = i + 1;
              const done =
                day < reward.data.streakDay ||
                (day === reward.data.streakDay && !reward.data.claimable);
              return (
                <li
                  key={day}
                  aria-hidden
                  className={cn(
                    'grid h-8 flex-1 place-items-center rounded-md text-xs font-semibold',
                    done
                      ? 'bg-gold-400 text-felt-950'
                      : day === reward.data.streakDay
                        ? 'bg-white/20 ring-2 ring-gold-400'
                        : 'bg-white/10 text-white/60',
                  )}
                >
                  {day}
                </li>
              );
            })}
          </ol>
          {reward.data.claimable ? (
            <Button onClick={() => claim.mutate()} loading={claim.isPending}>
              Nhận {formatCoins(reward.data.amount)} xu
            </Button>
          ) : (
            <p className="text-sm text-white/75">
              Đã nhận hôm nay. Quay lại sau 0 giờ (giờ Việt Nam) để nhận tiếp.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}

export function LeaderboardPreview() {
  const source = useDataSource();
  const board = useQuery({
    queryKey: queryKeys.leaderboardPreview,
    queryFn: () => source.getLeaderboardPreview(),
  });
  return (
    <Panel
      title="Bảng xếp hạng tuần"
      icon={Trophy}
      action={
        <Link
          href="/leaderboard"
          className="inline-flex min-h-11 items-center gap-0.5 text-sm text-gold-300 hover:underline"
        >
          Xem tất cả <ChevronRight aria-hidden className="size-4" />
        </Link>
      }
    >
      {board.isPending ? (
        <LoadingRegion label="Đang tải bảng xếp hạng">
          <LoadingSkeleton className="h-40" />
        </LoadingRegion>
      ) : board.isError ? (
        <ErrorState message={errorMessage(board.error)} onRetry={() => void board.refetch()} />
      ) : board.data.length === 0 ? (
        <EmptyState icon={Trophy} title="Chưa có dữ liệu xếp hạng tuần này" />
      ) : (
        <LeaderboardTable entries={board.data} caption="Top 5 người chơi tuần này" />
      )}
    </Panel>
  );
}

export function HistoryShortcut() {
  return (
    <Link
      href="/history"
      className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-felt-800/70 px-4 hover:bg-felt-700/70"
    >
      <Clock aria-hidden className="size-5 text-gold-400" />
      <span className="flex-1 font-semibold">Lịch sử ván đấu</span>
      <ChevronRight aria-hidden className="size-5 text-white/60" />
    </Link>
  );
}
