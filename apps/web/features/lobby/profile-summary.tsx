'use client';

import { useQuery } from '@tanstack/react-query';
import { winRatePercent } from '@tienlen/shared';
import { UserAvatar } from '@/components/player/user-avatar';
import { QueryErrorState, LoadingRegion, LoadingSkeleton } from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { formatCoins, formatPercent } from '@/lib/format';

export function ProfileSummary() {
  const source = useDataSource();
  const user = useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => source.getCurrentUser(),
  });

  if (user.isPending) {
    return (
      <LoadingRegion label="Đang tải hồ sơ">
        <LoadingSkeleton className="h-24" />
      </LoadingRegion>
    );
  }
  if (user.isError) {
    return <QueryErrorState error={user.error} onRetry={() => void user.refetch()} />;
  }

  const { displayName, id, avatarUrl, balance, matchesPlayed, matchesWon } = user.data;
  const stats = [
    { label: 'Số xu', value: formatCoins(balance) },
    { label: 'Ván đã chơi', value: formatCoins(matchesPlayed) },
    { label: 'Tỉ lệ thắng', value: formatPercent(winRatePercent(matchesPlayed, matchesWon)) },
  ];

  return (
    <section
      aria-label="Hồ sơ của bạn"
      className="flex items-center gap-4 rounded-2xl border border-white/10 bg-felt-800/70 p-4"
    >
      <UserAvatar name={displayName} userId={id} avatarUrl={avatarUrl} size="lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold">Xin chào, {displayName}!</p>
        <dl className="mt-1 grid grid-cols-3 gap-2 text-sm">
          {stats.map((stat) => (
            // Labels may wrap on narrow phones; values stay on one baseline.
            <div key={stat.label} className="flex flex-col">
              <dt className="text-white/60">{stat.label}</dt>
              <dd className="mt-auto font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
