'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { LoadingRegion, LoadingSkeleton, QueryErrorState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { formatCoins, formatDateTime, shortId } from '@/lib/format';
import { adminApi } from './admin-api';
import { AdminCard } from './admin-shell';

export function AdminOverviewView() {
  const overview = useQuery({ queryKey: ['admin', 'overview'], queryFn: adminApi.overview });
  if (overview.isPending) {
    return (
      <LoadingRegion label="Đang tải tổng quan">
        <LoadingSkeleton className="h-64" />
      </LoadingRegion>
    );
  }
  if (overview.isError) {
    return <QueryErrorState error={overview.error} onRetry={() => void overview.refetch()} />;
  }
  const o = overview.data;
  const stat = (label: string, value: number | string, warn = false) => (
    <div key={label}>
      <dt className="text-sm text-white/60">{label}</dt>
      <dd className={cn('text-xl font-semibold tabular-nums', warn && 'text-red-300')}>
        {typeof value === 'number' ? formatCoins(value) : value}
      </dd>
    </div>
  );
  return (
    <>
      <h1 className="text-2xl font-bold">Tổng quan</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <AdminCard title="Người dùng">
          <dl className="grid grid-cols-2 gap-3">
            {stat('Tổng số', o.users.total)}
            {stat('Đang hoạt động', o.users.active)}
            {stat('Bị khóa', o.users.suspended)}
            {stat('Mới (7 ngày)', o.users.newLast7Days)}
          </dl>
        </AdminCard>
        <AdminCard title="Phòng và ván đấu">
          <dl className="grid grid-cols-2 gap-3">
            {stat('Phòng đang mở', o.rooms.open)}
            {stat('Ván đang chơi', o.matches.playing)}
            {stat('Ván xong (24 giờ)', o.matches.finishedLast24h)}
            {stat('Ván xong (7 ngày)', o.matches.finishedLast7Days)}
            {stat('Ván bị hủy (7 ngày)', o.matches.abortedLast7Days)}
            {stat('Xu đang lưu hành', o.coinsInCirculation)}
          </dl>
        </AdminCard>
        <AdminCard title="Sự cố">
          <dl className="grid grid-cols-2 gap-3">
            {stat('Hết giờ lượt (24 giờ)', o.incidents.timeoutsLast24h)}
            {stat('Ván cần kiểm tra', o.incidents.flaggedMatches, o.incidents.flaggedMatches > 0)}
            {stat('Báo cáo đang mở', o.incidents.openReports, o.incidents.openReports > 0)}
          </dl>
        </AdminCard>
        <AdminCard title="Hệ thống">
          <dl className="grid grid-cols-2 gap-3">
            {stat(
              'Cơ sở dữ liệu',
              o.health.database === 'up' ? 'Hoạt động' : 'Lỗi',
              o.health.database !== 'up',
            )}
            {stat(
              'Redis',
              o.health.redis === 'up' ? 'Hoạt động' : 'Không kết nối',
              o.health.redis !== 'up',
            )}
          </dl>
          <p className="mt-3 text-xs text-white/50">Cập nhật {formatDateTime(o.generatedAt)}</p>
        </AdminCard>
      </div>
    </>
  );
}

export function AdminAuditView() {
  const log = useInfiniteQuery({
    queryKey: ['admin', 'audit'],
    queryFn: ({ pageParam }) => adminApi.auditLog(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const entries = log.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      <h1 className="text-2xl font-bold">Nhật ký quản trị</h1>
      <AdminCard>
        {log.isPending ? (
          <LoadingSkeleton className="h-64" />
        ) : log.isError ? (
          <QueryErrorState error={log.error} onRetry={() => void log.refetch()} />
        ) : entries.length === 0 ? (
          <p className="text-sm text-white/60">Chưa có thao tác nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">Nhật ký quản trị</caption>
              <thead>
                <tr className="text-left text-white/60">
                  <th scope="col" className="py-2 font-medium">
                    Thời gian
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Người thực hiện
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Thao tác
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Đối tượng
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Lý do
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-white/10 align-top">
                    <td className="py-2 whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                    <td className="py-2">{e.actor?.displayName ?? '—'}</td>
                    <td className="py-2 font-mono text-xs">{e.action}</td>
                    <td className="py-2 font-mono text-xs">
                      {e.targetType} {e.targetId ? shortId(e.targetId) : ''}
                    </td>
                    <td className="py-2">{e.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {log.hasNextPage ? (
          <Button
            variant="secondary"
            className="mt-3 w-full"
            loading={log.isFetchingNextPage}
            onClick={() => void log.fetchNextPage()}
          >
            Xem thêm
          </Button>
        ) : null}
      </AdminCard>
    </>
  );
}
