import type { LeaderboardMetric } from './contracts/history';
import { winRatePercent } from './stats';

/**
 * Leaderboard ranking (README, "History, leaderboard and notifications"):
 *
 * - `wins`: most 1st-place finishes; ties go to fewer matches played.
 * - `winRate`: highest wins ÷ matches (exact fractions, no rounding); ties go to more wins.
 *   Only players with at least `minMatches` finished matches are ranked.
 * - `played`: most finished matches; ties go to more wins.
 *
 * Players still equal after the tie-break share a rank (1, 1, 3 …) and are listed by display
 * name. Players with no wins are not ranked by wins.
 */
export interface LeaderboardRow {
  userId: string;
  displayName: string;
  wins: number;
  played: number;
}

export interface RankedRow extends LeaderboardRow {
  rank: number;
  winRate: number;
}

type Comparator = (a: LeaderboardRow, b: LeaderboardRow) => number;

const COMPARATORS: Readonly<Record<LeaderboardMetric, Comparator>> = {
  wins: (a, b) => b.wins - a.wins || a.played - b.played,
  // a.wins / a.played vs b.wins / b.played, compared as cross products.
  winRate: (a, b) => b.wins * a.played - a.wins * b.played || b.wins - a.wins,
  played: (a, b) => b.played - a.played || b.wins - a.wins,
};

export function rankLeaderboard(
  rows: readonly LeaderboardRow[],
  metric: LeaderboardMetric,
  minMatches: number,
): RankedRow[] {
  const compare = COMPARATORS[metric];
  const eligible = rows.filter((row) =>
    metric === 'wins'
      ? row.wins > 0
      : metric === 'winRate'
        ? row.played >= minMatches
        : row.played > 0,
  );
  const sorted = [...eligible].sort(
    (a, b) =>
      compare(a, b) ||
      a.displayName.localeCompare(b.displayName, 'vi') ||
      a.userId.localeCompare(b.userId),
  );
  // Sorted, so equal rows are adjacent: each keeps the rank of the first of its group.
  const ranked: RankedRow[] = [];
  sorted.forEach((row, index) => {
    const previous = ranked[index - 1];
    const rank = previous && compare(previous, row) === 0 ? previous.rank : index + 1;
    ranked.push({ ...row, rank, winRate: winRatePercent(row.played, row.wins) });
  });
  return ranked;
}
