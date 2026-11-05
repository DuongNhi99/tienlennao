import type { SeriesSummary } from '@tienlen/shared';
import { Crown } from 'lucide-react';
import Link from 'next/link';
import { UserAvatar } from '@/components/player/user-avatar';
import { cn } from '@/lib/cn';
import { describeSeries } from '@/features/rules/series-fields';

/** Cumulative standings of a multi-round match (docs/GAME_RULES.md §20). */
export function SeriesStandings({
  series,
  roundNumber,
  myUserId,
  compact = false,
}: {
  series: SeriesSummary;
  roundNumber: number | null;
  myUserId: string | null;
  compact?: boolean;
}) {
  const finished = series.status === 'FINISHED';
  return (
    <section
      aria-label="Bảng điểm chuỗi ván"
      className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/15 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">
          {finished ? 'Chuỗi ván đã kết thúc' : 'Chuỗi ván'} ·{' '}
          <span className="font-normal text-white/80">{describeSeries(series, roundNumber)}</span>
        </h3>
        <Link
          href={`/series/${series.id}`}
          className="ml-auto text-xs text-gold-300 underline-offset-2 hover:underline"
        >
          Xem từng ván
        </Link>
      </div>
      {series.standings.length === 0 ? (
        <p className="text-xs text-white/60">Chưa có ván nào kết thúc.</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Điểm cộng dồn</caption>
          <thead className="text-xs text-white/60">
            <tr>
              <th scope="col" className="w-8 text-left font-normal">
                #
              </th>
              <th scope="col" className="text-left font-normal">
                Người chơi
              </th>
              <th scope="col" className="text-right font-normal">
                Điểm
              </th>
              {compact ? null : (
                <>
                  <th scope="col" className="text-right font-normal">
                    Nhất
                  </th>
                  <th scope="col" className="text-right font-normal">
                    Phạt
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {series.standings.map((row) => (
              <tr
                key={row.userId}
                className={cn(row.userId === myUserId && 'bg-gold-400/10 font-semibold')}
              >
                <td className="py-1 tabular-nums">{row.rank}</td>
                <td className="py-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <UserAvatar
                      name={row.displayName}
                      userId={row.userId}
                      avatarUrl={row.avatarUrl}
                      size="sm"
                    />
                    <span className="truncate">{row.displayName}</span>
                    {finished && row.userId === series.winnerId ? (
                      <Crown aria-label="Thắng chuỗi" className="size-4 shrink-0 text-gold-400" />
                    ) : null}
                  </span>
                </td>
                <td className="py-1 text-right tabular-nums">{row.totalScore}</td>
                {compact ? null : (
                  <>
                    <td className="py-1 text-right tabular-nums">{row.roundsWon}</td>
                    <td className="py-1 text-right tabular-nums">{row.penaltyPoints}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
