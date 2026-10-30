'use client';

import { useQuery } from '@tanstack/react-query';
import { winRatePercent } from '@tienlen/shared';
import { Settings } from 'lucide-react';
import { UserAvatar } from '@/components/player/user-avatar';
import {
  EmptyState,
  QueryErrorState,
  LoadingRegion,
  LoadingSkeleton,
} from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { formatCoins, formatDate, formatPercent, shortId } from '@/lib/format';
import { ProfileSettings } from './profile-settings';

export function ProfileView() {
  const source = useDataSource();
  const user = useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => source.getCurrentUser(),
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
  const losses = u.matchesPlayed - u.matchesWon;
  const stats = [
    ['Số xu hiện có', `${formatCoins(u.balance)} xu`],
    ['Tổng số ván', formatCoins(u.matchesPlayed)],
    ['Thắng (về nhất)', formatCoins(u.matchesWon)],
    ['Không về nhất', formatCoins(losses)],
    ['Tỉ lệ thắng', formatPercent(winRatePercent(u.matchesPlayed, u.matchesWon))],
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-felt-800/70 p-6 text-center sm:flex-row sm:text-left">
        <UserAvatar name={u.displayName} userId={u.id} avatarUrl={u.avatarUrl} size="xl" />
        <div>
          <h1 className="text-2xl font-bold">{u.displayName}</h1>
          <p className="text-sm text-white/70">
            ID: <span className="font-mono">{shortId(u.id)}</span> · Tham gia{' '}
            {formatDate(u.createdAt)}
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
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-white/60">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-white/50">
          Chỉ tính các ván đã kết thúc hợp lệ. Tỉ lệ thắng = số ván về nhất / tổng số ván.
        </p>
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
