'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  cardLabelVi,
  COMBINATION_LABELS_VI,
  type HistoryPlayer,
  type MatchHistoryDetail,
  REPORT_REASON_LABELS_VI,
  REPORT_REASONS,
  type TimelineEvent,
} from '@tienlen/shared';
import { Flag } from 'lucide-react';
import { useState } from 'react';
import { UserAvatar } from '@/components/player/user-avatar';
import { Button, ButtonLink } from '@/components/ui/button';
import { SelectField } from '@/components/ui/form-fields';
import { Modal } from '@/components/ui/modal';
import { LoadingRegion, LoadingSkeleton, QueryErrorState } from '@/components/ui/states';
import { useDataSource } from '@/features/data-source/provider';
import { queryKeys } from '@/features/data-source/query-keys';
import { errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { formatCoinDelta, formatCoins, formatDateTime } from '@/lib/format';
import { showToast } from '@/lib/toast-store';
import { formatDuration, placementLabel } from './history-list';

function describeEvent(event: TimelineEvent, name: (seat: number | null) => string): string {
  switch (event.type) {
    case 'PLAY': {
      const cards = (event.cards ?? []).map(cardLabelVi).join(', ');
      const kind = event.combinationType ? COMBINATION_LABELS_VI[event.combinationType] : '';
      const chop = event.choppedSeat === null ? '' : ` — chặt ${name(event.choppedSeat)}`;
      return `${name(event.seatIndex)} đánh ${kind.toLowerCase()}: ${cards}${chop}`;
    }
    case 'PASS':
      return `${name(event.seatIndex)} bỏ lượt`;
    case 'TURN_TIMEOUT':
      return `${name(event.seatIndex)} hết giờ, máy tự đi thay`;
    case 'TRICK_RESOLVED':
      return `${name(event.seatIndex)} thắng vòng`;
    case 'PLAYER_FINISHED':
      return `${name(event.seatIndex)} hết bài, về hạng ${event.place}`;
    case 'MATCH_FINISHED':
      return `Ván kết thúc — ${name(event.seatIndex)} về nhất`;
    case 'MATCH_ABORTED':
      return 'Ván đấu bị hủy, phí vào bàn được hoàn lại';
  }
}

function ReportDialog({
  match,
  player,
  onClose,
}: {
  match: MatchHistoryDetail;
  player: HistoryPlayer | null;
  onClose: () => void;
}) {
  const source = useDataSource();
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>('CHEATING');
  const [details, setDetails] = useState('');
  const report = useMutation({
    mutationFn: () =>
      source.reportPlayer({
        matchId: match.matchId,
        reportedUserId: player!.userId,
        reason,
        details: details.trim() || undefined,
      }),
    onSuccess: () => {
      showToast('Đã gửi báo cáo. Quản trị viên sẽ xem xét.', { variant: 'success' });
      onClose();
    },
    onError: (error) => showToast(errorMessage(error), { variant: 'error' }),
  });
  return (
    <Modal
      open={player !== null}
      onClose={onClose}
      title={`Báo cáo ${player?.displayName ?? ''}`}
      description="Báo cáo được gửi kèm mã ván đấu để quản trị viên kiểm tra."
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          report.mutate();
        }}
      >
        <SelectField
          label="Lý do"
          value={reason}
          onChange={(event) => setReason(event.target.value as typeof reason)}
        >
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {REPORT_REASON_LABELS_VI[r]}
            </option>
          ))}
        </SelectField>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Chi tiết (không bắt buộc)
          <textarea
            value={details}
            maxLength={1000}
            rows={4}
            onChange={(event) => setDetails(event.target.value)}
            className="rounded-lg border border-white/20 bg-felt-950/60 p-3 font-normal"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" loading={report.isPending}>
            Gửi báo cáo
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function HistoryDetail({ matchId }: { matchId: string }) {
  const source = useDataSource();
  const [reporting, setReporting] = useState<HistoryPlayer | null>(null);
  const match = useQuery({
    queryKey: queryKeys.historyMatch(matchId),
    queryFn: () => source.getMatchHistory(matchId),
  });

  if (match.isPending) {
    return (
      <LoadingRegion label="Đang tải ván đấu">
        <LoadingSkeleton className="h-96" />
      </LoadingRegion>
    );
  }
  if (match.isError) {
    return (
      <div className="flex flex-col gap-4">
        <QueryErrorState error={match.error} onRetry={() => void match.refetch()} />
        <ButtonLink href="/history" variant="secondary">
          Về lịch sử
        </ButtonLink>
      </div>
    );
  }

  const m = match.data;
  const bySeat = new Map(m.players.map((p) => [p.seatIndex, p]));
  const name = (seat: number | null) =>
    seat === null ? '' : seat === m.mySeat ? 'Bạn' : (bySeat.get(seat)?.displayName ?? '');
  const ranked = [...m.players].sort(
    (a, b) => (a.placement ?? 9) - (b.placement ?? 9) || a.seatIndex - b.seatIndex,
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">
          {placementLabel(m)} · {m.roomName ?? `Phòng ${m.roomCode}`}
        </h1>
        <p className="text-sm text-white/70">
          {formatDateTime(m.startedAt)} · {formatDuration(m.durationSeconds)} ·{' '}
          {m.entryFee > 0 ? `Cược ${formatCoins(m.entryFee)} xu` : 'Miễn phí'} · Mã phòng{' '}
          <span className="font-mono">{m.roomCode}</span>
        </p>
      </div>

      <section
        aria-labelledby="result-heading"
        className="rounded-2xl border border-white/10 bg-felt-800/70 p-5"
      >
        <h2 id="result-heading" className="mb-3 font-semibold">
          Kết quả
        </h2>
        <ul className="flex flex-col divide-y divide-white/10">
          {ranked.map((p) => (
            <li key={p.userId} className="flex items-center gap-3 py-2">
              <span className="w-6 text-center font-bold tabular-nums">{p.placement ?? '—'}</span>
              <UserAvatar
                name={p.displayName}
                userId={p.userId}
                avatarUrl={p.avatarUrl}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate">
                {p.displayName}
                {p.seatIndex === m.mySeat ? ' (bạn)' : ''}
              </span>
              {p.cardsRemaining ? (
                <span className="text-xs text-white/60">còn {p.cardsRemaining} lá</span>
              ) : null}
              {p.coinDelta !== null && m.entryFee > 0 ? (
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    p.coinDelta >= 0 ? 'text-emerald-300' : 'text-red-300',
                  )}
                >
                  {formatCoinDelta(p.coinDelta)} xu
                </span>
              ) : null}
              {p.seatIndex !== m.mySeat ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Báo cáo ${p.displayName}`}
                  icon={<Flag aria-hidden className="size-4" />}
                  onClick={() => setReporting(p)}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="timeline-heading"
        className="rounded-2xl border border-white/10 bg-felt-800/70 p-5"
      >
        <h2 id="timeline-heading" className="mb-3 font-semibold">
          Diễn biến
        </h2>
        {m.timeline.length === 0 ? (
          <p className="text-sm text-white/60">Không có diễn biến được lưu cho ván này.</p>
        ) : (
          <ol className="flex flex-col gap-1 text-sm">
            {m.timeline.map((event) => (
              <li key={event.sequence} className="flex gap-3">
                <span className="w-8 shrink-0 text-right text-white/40 tabular-nums">
                  {event.sequence}
                </span>
                <span>{describeEvent(event, name)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <ReportDialog match={m} player={reporting} onClose={() => setReporting(null)} />
    </div>
  );
}
