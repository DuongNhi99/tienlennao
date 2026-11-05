import type { LeaderboardMetric } from './contracts/history';
import { averageOneDecimal, winRatePercent } from './stats';

/**
 * Leaderboard ranking (README, "History, leaderboard and notifications"). Every board counts
 * finished rounds only.
 *
 * | Metric       | Ranked by                              | Tie-break             | Listed when            |
 * | ------------ | -------------------------------------- | --------------------- | ---------------------- |
 * | `points`     | most points (sum of round scores)      | more wins             | played ≥ 1             |
 * | `wins`       | most 1st places                        | fewer rounds played   | wins ≥ 1               |
 * | `winRate`    | wins ÷ rounds (exact fractions)        | more wins             | played ≥ `minMatches`  |
 * | `played`     | most rounds                            | more wins             | played ≥ 1             |
 * | `bestStreak` | longest run of wins in the period      | more wins             | streak ≥ 1             |
 * | `chops`      | most chops made                        | fewer rounds played   | chops ≥ 1              |
 * | `lowPenalty` | fewest penalty points per round        | more rounds played    | played ≥ `minMatches`  |
 *
 * Players still equal after the tie-break share a rank (1, 1, 3 …) and are listed by display
 * name.
 */
export interface LeaderboardRow {
  userId: string;
  displayName: string;
  wins: number;
  played: number;
  points?: number;
  bestStreak?: number;
  chops?: number;
  penaltyPoints?: number;
}

export interface RankedRow extends Required<LeaderboardRow> {
  rank: number;
  winRate: number;
  averagePenalty: number;
}

type Comparator = (a: Required<LeaderboardRow>, b: Required<LeaderboardRow>) => number;

const COMPARATORS: Readonly<Record<LeaderboardMetric, Comparator>> = {
  points: (a, b) => b.points - a.points || b.wins - a.wins,
  wins: (a, b) => b.wins - a.wins || a.played - b.played,
  // a.wins / a.played vs b.wins / b.played, compared as cross products.
  winRate: (a, b) => b.wins * a.played - a.wins * b.played || b.wins - a.wins,
  played: (a, b) => b.played - a.played || b.wins - a.wins,
  bestStreak: (a, b) => b.bestStreak - a.bestStreak || b.wins - a.wins,
  chops: (a, b) => b.chops - a.chops || a.played - b.played,
  // Lower penalties per round first: a.penalty / a.played vs b.penalty / b.played.
  lowPenalty: (a, b) =>
    a.penaltyPoints * b.played - b.penaltyPoints * a.played || b.played - a.played,
};

const ELIGIBLE: Readonly<
  Record<LeaderboardMetric, (row: Required<LeaderboardRow>, minMatches: number) => boolean>
> = {
  points: (row) => row.played > 0,
  wins: (row) => row.wins > 0,
  winRate: (row, min) => row.played >= Math.max(1, min),
  played: (row) => row.played > 0,
  bestStreak: (row) => row.bestStreak > 0,
  chops: (row) => row.chops > 0,
  lowPenalty: (row, min) => row.played >= Math.max(1, min),
};

export function rankLeaderboard(
  rows: readonly LeaderboardRow[],
  metric: LeaderboardMetric,
  minMatches: number,
): RankedRow[] {
  const compare = COMPARATORS[metric];
  const complete = rows.map((row) => ({
    points: 0,
    bestStreak: 0,
    chops: 0,
    penaltyPoints: 0,
    ...row,
  }));
  const sorted = complete
    .filter((row) => ELIGIBLE[metric](row, minMatches))
    .sort(
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
    ranked.push({
      ...row,
      rank,
      winRate: winRatePercent(row.played, row.wins),
      averagePenalty: averageOneDecimal(row.penaltyPoints, row.played),
    });
  });
  return ranked;
}

/** Lower-cased, without Vietnamese diacritics: "Đức" and "duc" match. */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLocaleLowerCase('vi');
}

/** Whether a display name matches a leaderboard or player search. */
export function matchesSearch(displayName: string, search: string): boolean {
  return searchKey(displayName).includes(searchKey(search));
}
