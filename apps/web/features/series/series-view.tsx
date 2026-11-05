'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingRegion, LoadingSkeleton, QueryErrorState } from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { ruleSetLabel } from '@/features/history/rules-summary';
import { errorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { showToast } from '@/lib/toast-store';
import { SeriesStandings } from './series-standings';

/** A multi-round match: standings, every round's results, and the host's manual end. */
export function SeriesView({ seriesId }: { seriesId: string }) {
  const source = useDataSource();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const series = useQuery({
    queryKey: queryKeys.series(seriesId),
    queryFn: () => source.getSeries(seriesId),
  });
  const user = useQuery({
    queryKey: queryKeys.currentUser,
    queryFn: () => source.getCurrentUser(),
  });
  const finish = useMutation({
    mutationFn: () => source.finishSeries(seriesId),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.series(seriesId), data);
      setConfirm(false);
      showToast('Đã kết thúc chuỗi ván.', { variant: 'success' });
    },
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });

  if (series.isPending) {
    return (
      <LoadingRegion label="Đang tải chuỗi ván">
        <LoadingSkeleton className="h-64" />
      </LoadingRegion>
    );
  }
  if (series.isError) {
    return <QueryErrorState error={series.error} onRetry={() => void series.refetch()} />;
  }
  const s = series.data;
  const isHost = user.data?.id === s.hostId;
  const playing = s.rounds.some((r) => r.status === 'PLAYING');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-2xl font-bold">Chuỗi ván</h1>
        {s.nextRoomId ? (
          <ButtonLink href={`/room/${s.nextRoomId}`}>Vào ván tiếp theo</ButtonLink>
        ) : null}
        {isHost && s.status === 'IN_PROGRESS' ? (
          <Button
            variant="secondary"
            icon={<Flag aria-hidden className="size-4" />}
            disabled={playing}
            title={playing ? 'Đợi ván đang chơi kết thúc.' : undefined}
            onClick={() => setConfirm(true)}
          >
            Kết thúc chuỗi
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-white/70">
        Bắt đầu {formatDateTime(s.createdAt)}
        {s.finishedAt ? ` · kết thúc ${formatDateTime(s.finishedAt)}` : ''}
        {s.rules ? ` · luật ${ruleSetLabel(s.rules)}` : ''}
      </p>
      <SeriesStandings series={s} roundNumber={null} myUserId={user.data?.id ?? null} />
      <section aria-labelledby="rounds-heading" className="flex flex-col gap-2">
        <h2 id="rounds-heading" className="font-semibold">
          Các ván
        </h2>
        <ol className="flex flex-col gap-2">
          {s.rounds.map((round) => (
            <li
              key={round.matchId}
              className="rounded-xl border border-white/10 bg-felt-800/70 p-4"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="font-semibold">Ván {round.roundNumber}</p>
                <span className="text-xs text-white/60">
                  {round.status === 'PLAYING'
                    ? 'Đang chơi'
                    : round.status === 'ABORTED'
                      ? 'Đã hủy (không tính điểm)'
                      : round.finishedAt
                        ? formatDateTime(round.finishedAt)
                        : ''}
                </span>
                {round.status !== 'PLAYING' ? (
                  <Link
                    href={`/history/${round.matchId}`}
                    className="ml-auto text-xs text-gold-300 underline-offset-2 hover:underline"
                  >
                    Chi tiết
                  </Link>
                ) : null}
              </div>
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {[...round.results]
                  .sort((a, b) => (a.placement ?? 9) - (b.placement ?? 9))
                  .map((r) => (
                    <li key={r.userId} className="flex justify-between gap-2">
                      <span className="truncate">
                        {r.placement ? `${r.placement}. ` : ''}
                        {r.displayName}
                      </span>
                      <span className="tabular-nums text-white/80">
                        {r.roundScore === null
                          ? '—'
                          : `${r.roundScore > 0 ? '+' : ''}${r.roundScore}`}
                        {r.penaltyPoints ? ` (phạt ${r.penaltyPoints})` : ''}
                      </span>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
      <ConfirmDialog
        open={confirm}
        title="Kết thúc chuỗi ván?"
        description="Bảng điểm hiện tại là kết quả cuối cùng. Phòng chờ ván sau (nếu có) sẽ thành phòng chơi một ván."
        confirmLabel="Kết thúc"
        loading={finish.isPending}
        onConfirm={() => finish.mutate()}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
