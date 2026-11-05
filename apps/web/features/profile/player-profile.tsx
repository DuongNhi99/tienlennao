'use client';

import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { UserAvatar } from '@/components/player/user-avatar';
import {
  EmptyState,
  LoadingRegion,
  LoadingSkeleton,
  QueryErrorState,
} from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { formatDate, shortId } from '@/lib/format';
import { AchievementsList, StatisticsDashboard } from './statistics-dashboard';

/** Another player's profile; statistics and achievements only when the profile is public. */
export function PlayerProfile({ userId }: { userId: string }) {
  const source = useDataSource();
  const profile = useQuery({
    queryKey: queryKeys.profile(userId),
    queryFn: () => source.getProfile(userId),
  });
  if (profile.isPending) {
    return (
      <LoadingRegion label="Đang tải hồ sơ">
        <LoadingSkeleton className="h-64" />
      </LoadingRegion>
    );
  }
  if (profile.isError) {
    return <QueryErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  }
  const p = profile.data;
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-felt-800/70 p-6 text-center sm:flex-row sm:text-left">
        <UserAvatar name={p.displayName} userId={p.userId} avatarUrl={p.avatarUrl} size="xl" />
        <div>
          <h1 className="text-2xl font-bold">{p.displayName}</h1>
          <p className="text-sm text-white/70">
            ID: <span className="font-mono">{shortId(p.userId)}</span> · Tham gia{' '}
            {formatDate(p.createdAt)}
          </p>
        </div>
      </section>
      {p.statistics ? (
        <section className="rounded-2xl border border-white/10 bg-felt-800/70 p-5">
          <h2 className="mb-3 font-semibold">Thống kê</h2>
          <StatisticsDashboard stats={p.statistics} />
        </section>
      ) : (
        <EmptyState
          icon={Lock}
          title="Hồ sơ riêng tư"
          description="Người chơi này đã ẩn thống kê và thành tích."
        />
      )}
      {p.achievements ? (
        <div className="rounded-2xl border border-white/10 bg-felt-800/70 p-5">
          <AchievementsList items={p.achievements} />
        </div>
      ) : null}
    </div>
  );
}
