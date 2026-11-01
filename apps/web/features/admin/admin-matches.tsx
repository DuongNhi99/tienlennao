'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/form-fields';
import { LoadingSkeleton, QueryErrorState } from '@/components/ui/states';
import { errorMessage } from '@/lib/api/client';
import { formatCoinDelta, formatCoins, formatDateTime } from '@/lib/format';
import { showToast } from '@/lib/toast-store';
import { adminApi } from './admin-api';
import { AdminCard, ReasonDialog } from './admin-shell';

const STATUS_LABELS: Record<string, string> = {
  PLAYING: 'Đang chơi',
  FINISHED: 'Đã xong',
  ABORTED: 'Đã hủy',
  CREATED: 'Mới tạo',
  DEALING: 'Đang chia',
  RESOLVING: 'Đang chốt',
};

export function AdminMatchesView() {
  const [status, setStatus] = useState('');
  const [flagged, setFlagged] = useState('');
  const filter = {
    status: status || undefined,
    flagged: flagged === '' ? undefined : flagged === 'true',
  };
  const matches = useInfiniteQuery({
    queryKey: ['admin', 'matches', filter],
    queryFn: ({ pageParam }) => adminApi.matches({ ...filter, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = matches.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <>
      <h1 className="text-2xl font-bold">Ván đấu</h1>
      <div className="flex flex-wrap gap-3">
        <SelectField label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tất cả</option>
          <option value="PLAYING">Đang chơi</option>
          <option value="FINISHED">Đã xong</option>
          <option value="ABORTED">Đã hủy</option>
        </SelectField>
        <SelectField
          label="Cần kiểm tra"
          value={flagged}
          onChange={(e) => setFlagged(e.target.value)}
        >
          <option value="">Tất cả</option>
          <option value="true">Có</option>
          <option value="false">Không</option>
        </SelectField>
      </div>
      <AdminCard>
        {matches.isPending ? (
          <LoadingSkeleton className="h-40" />
        ) : matches.isError ? (
          <QueryErrorState error={matches.error} onRetry={() => void matches.refetch()} />
        ) : items.length === 0 ? (
          <p className="text-sm text-white/60">Không có ván nào.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/10 text-sm">
            {items.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/admin/matches/${m.id}`}
                  className="flex flex-wrap gap-x-3 py-2 hover:bg-white/5"
                >
                  <span className="font-mono">{m.roomCode}</span>
                  <span>{STATUS_LABELS[m.status]}</span>
                  <span className="text-white/60">
                    {m.startedAt ? formatDateTime(m.startedAt) : '—'}
                  </span>
                  <span className="text-white/60">
                    {m.players.map((p) => p.displayName).join(', ')}
                  </span>
                  {m.flaggedForReview ? <span className="text-red-300">Cần kiểm tra</span> : null}
                  {m.openReports > 0 ? (
                    <span className="text-red-300">{m.openReports} báo cáo</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {matches.hasNextPage ? (
          <Button
            variant="secondary"
            className="mt-3 w-full"
            loading={matches.isFetchingNextPage}
            onClick={() => void matches.fetchNextPage()}
          >
            Xem thêm
          </Button>
        ) : null}
      </AdminCard>
    </>
  );
}

export function AdminMatchDetailView({ matchId }: { matchId: string }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'flag' | 'abort' | null>(null);
  const match = useQuery({
    queryKey: ['admin', 'match', matchId],
    queryFn: () => adminApi.match(matchId),
  });
  const action = useMutation({
    mutationFn: (reason: string) =>
      dialog === 'abort'
        ? adminApi.abortMatch(matchId, reason)
        : adminApi.flagMatch(matchId, !match.data!.flaggedForReview, reason),
    onSuccess: (detail) => {
      queryClient.setQueryData(['admin', 'match', matchId], detail);
      showToast('Đã cập nhật ván đấu.', { variant: 'success' });
      setDialog(null);
    },
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });

  if (match.isPending) return <LoadingSkeleton className="h-64" />;
  if (match.isError) {
    return <QueryErrorState error={match.error} onRetry={() => void match.refetch()} />;
  }
  const m = match.data;
  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">
          Ván tại phòng <span className="font-mono">{m.roomCode}</span>
        </h1>
        <p className="font-mono text-sm text-white/60">{m.id}</p>
      </div>
      <AdminCard title="Thông tin">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ['Trạng thái', STATUS_LABELS[m.status]],
              ['Phí vào bàn', `${formatCoins(m.entryFee)} xu`],
              ['Bắt đầu', m.startedAt ? formatDateTime(m.startedAt) : '—'],
              ['Kết thúc', m.finishedAt ? formatDateTime(m.finishedAt) : '—'],
              ['Đã quyết toán', m.settledAt ? formatDateTime(m.settledAt) : 'Chưa'],
              ['Hết giờ lượt', String(m.timeouts)],
              ['Báo cáo mở', String(m.openReports)],
              ['Cần kiểm tra', m.flaggedForReview ? 'Có' : 'Không'],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm text-white/60">{label}</dt>
              <dd className="font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {m.abortReason ? <p className="mt-3 text-sm">Lý do hủy: {m.abortReason}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setDialog('flag')}>
            {m.flaggedForReview ? 'Bỏ đánh dấu kiểm tra' : 'Đánh dấu cần kiểm tra'}
          </Button>
          {m.status === 'PLAYING' ? (
            <Button variant="danger" onClick={() => setDialog('abort')}>
              Hủy ván và hoàn phí
            </Button>
          ) : null}
        </div>
      </AdminCard>
      <AdminCard title="Người chơi">
        <ul className="flex flex-col divide-y divide-white/10 text-sm">
          {m.players.map((p) => (
            <li key={p.userId} className="flex gap-3 py-2">
              <span className="w-12 text-white/60">Ghế {p.seatIndex + 1}</span>
              <Link href={`/admin/users/${p.userId}`} className="flex-1 hover:underline">
                {p.displayName}
              </Link>
              <span>{p.placement ? `Hạng ${p.placement}` : '—'}</span>
              <span className="w-20 text-right tabular-nums">
                {p.coinDelta === null ? '—' : formatCoinDelta(p.coinDelta)}
              </span>
            </li>
          ))}
        </ul>
      </AdminCard>
      <AdminCard title={`Nhật ký sự kiện (${m.events.length})`}>
        <p className="mb-2 text-xs text-white/60">
          Bao gồm cả bài chia (DEALT) để phục vụ điều tra; người chơi không bao giờ thấy phần này.
        </p>
        <ol className="flex max-h-[32rem] flex-col gap-1 overflow-y-auto font-mono text-xs">
          {m.events.map((e) => (
            <li key={e.sequence} className="flex gap-2">
              <span className="w-8 shrink-0 text-right text-white/40">{e.sequence}</span>
              <span className="w-32 shrink-0">{e.type}</span>
              <span className="break-all text-white/70">{JSON.stringify(e.payload)}</span>
            </li>
          ))}
        </ol>
      </AdminCard>
      <ReasonDialog
        key={dialog ?? 'closed'}
        open={dialog !== null}
        title={
          dialog === 'abort'
            ? 'Hủy ván và hoàn phí'
            : m.flaggedForReview
              ? 'Bỏ đánh dấu kiểm tra'
              : 'Đánh dấu cần kiểm tra'
        }
        description={
          dialog === 'abort'
            ? 'Mọi phí vào bàn được hoàn đủ một lần; không ai được thưởng. Không thể hoàn tác.'
            : undefined
        }
        confirmLabel="Xác nhận"
        danger={dialog === 'abort'}
        pending={action.isPending}
        onConfirm={(reason) => action.mutate(reason)}
        onClose={() => setDialog(null)}
      />
    </>
  );
}
