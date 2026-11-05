import type { LeaderboardEntry, LeaderboardMetric } from '@tienlen/shared';
import Link from 'next/link';
import { UserAvatar } from '@/components/player/user-avatar';
import { cn } from '@/lib/cn';
import { formatCoins, formatPercent } from '@/lib/format';

const EXTRA_COLUMNS: Partial<
  Record<LeaderboardMetric, { label: string; value: (entry: LeaderboardEntry) => string }>
> = {
  points: { label: 'Điểm', value: (e) => formatCoins(e.points) },
  bestStreak: { label: 'Chuỗi thắng', value: (e) => String(e.bestStreak) },
  chops: { label: 'Lần chặt', value: (e) => formatCoins(e.chops) },
  lowPenalty: {
    label: 'Phạt / ván',
    value: (e) => e.averagePenalty.toLocaleString('vi-VN'),
  },
};

/** Public data only: display name, avatar, and match counts — never emails. */
export function LeaderboardTable({
  entries,
  caption,
  detailed = false,
  highlightUserId,
  metric,
}: {
  entries: LeaderboardEntry[];
  caption: string;
  /** Also show matches played and win rate (full leaderboard page). */
  detailed?: boolean;
  /** Marks the viewer's own row. */
  highlightUserId?: string;
  /** Adds the column the board is ranked by when it is not one of the standard ones. */
  metric?: LeaderboardMetric;
}) {
  const extra = metric ? EXTRA_COLUMNS[metric] : undefined;
  // On phones a board ranked by an extra column drops the secondary columns, so numbers never run together.
  const secondary = extra ? 'hidden sm:table-cell' : '';
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="text-left text-white/60">
          <th scope="col" className="w-10 py-2 font-medium">
            Hạng
          </th>
          <th scope="col" className="py-2 font-medium">
            Người chơi
          </th>
          <th scope="col" className="py-2 pl-3 text-right font-medium">
            Thắng
          </th>
          {detailed ? (
            <>
              <th scope="col" className={cn('py-2 pl-3 text-right font-medium', secondary)}>
                Số ván
              </th>
              <th scope="col" className={cn('py-2 pl-3 text-right font-medium', secondary)}>
                Tỉ lệ
              </th>
              {extra ? (
                <th scope="col" className="py-2 pl-3 text-right font-medium">
                  {extra.label}
                </th>
              ) : null}
            </>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <tr
            key={entry.userId}
            aria-current={entry.userId === highlightUserId ? 'true' : undefined}
            className={cn(
              'border-t border-white/10',
              entry.userId === highlightUserId && 'bg-gold-400/10',
            )}
          >
            <td className={cn('py-2 font-bold tabular-nums', entry.rank <= 3 && 'text-gold-300')}>
              {entry.rank}
            </td>
            <td className="py-2">
              <span className="flex min-w-0 items-center gap-2">
                <UserAvatar
                  name={entry.displayName}
                  userId={entry.userId}
                  avatarUrl={entry.avatarUrl}
                  size="sm"
                />
                {detailed ? (
                  <Link href={`/players/${entry.userId}`} className="truncate hover:underline">
                    {entry.displayName}
                  </Link>
                ) : (
                  <span className="truncate">{entry.displayName}</span>
                )}
              </span>
            </td>
            <td className="py-2 pl-3 text-right font-semibold tabular-nums">
              {formatCoins(entry.wins)}
            </td>
            {detailed ? (
              <>
                <td className={cn('py-2 pl-3 text-right tabular-nums', secondary)}>
                  {formatCoins(entry.matchesPlayed)}
                </td>
                <td className={cn('py-2 pl-3 text-right tabular-nums', secondary)}>
                  {formatPercent(entry.winRate)}
                </td>
                {extra ? (
                  <td className="py-2 pl-3 text-right font-semibold tabular-nums">
                    {extra.value(entry)}
                  </td>
                ) : null}
              </>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
