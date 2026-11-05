'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings } from 'lucide-react';
import Link from 'next/link';
import { UserAvatar } from '@/components/player/user-avatar';
import { CheckboxField } from '@/components/ui/form-fields';
import {
  EmptyState,
  QueryErrorState,
  LoadingRegion,
  LoadingSkeleton,
} from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { errorMessage } from '@/lib/api/client';
import { formatCoins, formatDate, shortId } from '@/lib/format';
import { showToast } from '@/lib/toast-store';
import { ProfileSettings } from './profile-settings';
import { AchievementsList, StatisticsDashboard } from './statistics-dashboard';

function PrivacyToggle({ userId }: { userId: string }) {
  const source = useDataSource();
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: queryKeys.profile(userId),
    queryFn: () => source.getProfile(userId),
  });
  const save = useMutation({
    mutationFn: (isPrivate: boolean) =>
      source.setProfileVisibility(isPrivate ? 'PRIVATE' : 'PUBLIC'),
    onSuccess: (data) => queryClient.setQueryData(queryKeys.profile(userId), data),
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });
  if (profile.isPending) return <LoadingSkeleton className="h-11" />;
  if (profile.isError) {
    return <QueryErrorState error={profile.error} onRetry={() => void profile.refetch()} />;
  }
  return (
    <CheckboxField
      label="Ẩn thống kê và thành tích với người chơi khác (hồ sơ riêng tư)"
      checked={profile.data.visibility === 'PRIVATE'}
      disabled={save.isPending}
      onChange={(e) => save.mutate(e.target.checked)}
    />
  );
}

export function ProfileView() {
  const source = useDataSource();
  const user = useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => source.getCurrentUser(),
  });
  const stats = useQuery({
    queryKey: queryKeys.statistics,
    queryFn: () => source.getMyStatistics(),
  });
  const achievements = useQuery({
    queryKey: queryKeys.achievements,
    queryFn: () => source.getMyAchievements(),
  });

  if (user.isPending) {
    return (
      <LoadingRegion label="Đang tải hồ sơ">
        <LoadingSkeleton className="h-64" />
      </LoadingRegion>
    );
  }
  if (user.isError)
    return <QueryErrorState error={user.error} onRetry={() => void user.refetch()} />;

  const u = user.data;
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-felt-800/70 p-6 text-center sm:flex-row sm:text-left">
        <UserAvatar name={u.displayName} userId={u.id} avatarUrl={u.avatarUrl} size="xl" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{u.displayName}</h1>
          <p className="text-sm text-white/70">
            ID: <span className="font-mono">{shortId(u.id)}</span> · Tham gia{' '}
            {formatDate(u.createdAt)} · {formatCoins(u.balance)} xu
          </p>
          <p className="mt-1 flex flex-wrap justify-center gap-x-3 text-xs sm:justify-start">
            <Link className="text-gold-300 hover:underline" href={`/players/${u.id}`}>
              Xem hồ sơ như người khác thấy
            </Link>
            <Link className="text-gold-300 hover:underline" href="/invitations">
              Lời mời vào bàn
            </Link>
          </p>
        </div>
      </section>
      <section
        aria-labelledby="stats-heading"
        className="rounded-2xl border border-white/10 bg-felt-800/70 p-5"
      >
        <h2 id="stats-heading" className="mb-3 font-semibold">
          Thống kê
        </h2>
        {stats.isPending ? (
          <LoadingSkeleton className="h-48" />
        ) : stats.isError ? (
          <QueryErrorState error={stats.error} onRetry={() => void stats.refetch()} />
        ) : (
          <StatisticsDashboard stats={stats.data} />
        )}
      </section>
      <div className="rounded-2xl border border-white/10 bg-felt-800/70 p-5">
        {achievements.isPending ? (
          <LoadingSkeleton className="h-32" />
        ) : achievements.isError ? (
          <QueryErrorState error={achievements.error} onRetry={() => void achievements.refetch()} />
        ) : (
          <AchievementsList items={achievements.data} />
        )}
      </div>
      <section className="rounded-2xl border border-white/10 bg-felt-800/70 p-5">
        <h2 className="mb-3 font-semibold">Quyền riêng tư</h2>
        <PrivacyToggle userId={u.id} />
      </section>
      {source.kind === 'api' ? (
        <ProfileSettings user={u} />
      ) : (
        <EmptyState
          icon={Settings}
          title="Cài đặt hồ sơ"
          description="Không khả dụng ở chế độ xem trước giao diện: cần đăng nhập bằng tài khoản thật."
        />
      )}
    </div>
  );
}
