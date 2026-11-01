import type { LeaderboardEntry } from '@tienlen/shared';
import { UserAvatar } from '@/components/player/user-avatar';
import { cn } from '@/lib/cn';
import { formatCoins, formatPercent } from '@/lib/format';

/** Public data only: display name, avatar, and match counts — never emails. */
export function LeaderboardTable({
  entries,
  caption,
  detailed = false,
  highlightUserId,
}: {
  entries: LeaderboardEntry[];
  caption: string;
  /** Also show matches played and win rate (full leaderboard page). */
  detailed?: boolean;
  /** Marks the viewer's own row. */
  highlightUserId?: string;
}) {
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
          <th scope="col" className="py-2 text-right font-medium">
            Thắng
          </th>
          {detailed ? (
            <>
              <th scope="col" className="py-2 text-right font-medium">
                Số ván
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Tỉ lệ
              </th>
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
                <span className="truncate">{entry.displayName}</span>
              </span>
            </td>
            <td className="py-2 text-right font-semibold tabular-nums">
              {formatCoins(entry.wins)}
            </td>
            {detailed ? (
              <>
                <td className="py-2 text-right tabular-nums">{formatCoins(entry.matchesPlayed)}</td>
                <td className="py-2 text-right tabular-nums">{formatPercent(entry.winRate)}</td>
              </>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
