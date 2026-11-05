import type { SeriesSettings } from './schemas/rooms';

/**
 * Multi-round matches (docs/GAME_RULES.md §20). A series is a sequence of rounds (ordinary
 * matches) played by the same table under one rule snapshot. Each finished round adds its round
 * scores; aborted rounds never count.
 */

export interface SeriesRoundResult {
  userId: string;
  displayName: string;
  roundNumber: number;
  placement: number;
  roundScore: number;
  penaltyPoints: number;
}

export interface SeriesStandingRow {
  userId: string;
  displayName: string;
  rank: number;
  totalScore: number;
  roundsPlayed: number;
  roundsWon: number;
  penaltyPoints: number;
}

/** Higher total first, then more round wins, then fewer penalty points. Equal rows share a rank. */
const compareStanding = (a: SeriesStandingRow, b: SeriesStandingRow) =>
  b.totalScore - a.totalScore || b.roundsWon - a.roundsWon || a.penaltyPoints - b.penaltyPoints;

export function rankSeriesStandings(results: readonly SeriesRoundResult[]): SeriesStandingRow[] {
  const byUser = new Map<string, SeriesStandingRow>();
  for (const r of results) {
    const row = byUser.get(r.userId) ?? {
      userId: r.userId,
      displayName: r.displayName,
      rank: 0,
      totalScore: 0,
      roundsPlayed: 0,
      roundsWon: 0,
      penaltyPoints: 0,
    };
    row.totalScore += r.roundScore;
    row.roundsPlayed += 1;
    row.roundsWon += r.placement === 1 ? 1 : 0;
    row.penaltyPoints += r.penaltyPoints;
    byUser.set(r.userId, row);
  }
  const sorted = [...byUser.values()].sort(
    (a, b) =>
      compareStanding(a, b) ||
      a.displayName.localeCompare(b.displayName, 'vi') ||
      a.userId.localeCompare(b.userId),
  );
  sorted.forEach((row, index) => {
    const previous = sorted[index - 1];
    row.rank = previous && compareStanding(previous, row) === 0 ? previous.rank : index + 1;
  });
  return sorted;
}

/**
 * The series winner: the only player ranked 1st or, when several share it, the one who placed
 * best in the latest round they all played. Null before any round has finished.
 */
export function seriesWinner(
  standings: readonly SeriesStandingRow[],
  results: readonly SeriesRoundResult[],
): string | null {
  const leaders = standings.filter((row) => row.rank === 1);
  if (leaders.length <= 1) return leaders[0]?.userId ?? null;
  const ids = new Set(leaders.map((row) => row.userId));
  const rounds = [...new Set(results.map((r) => r.roundNumber))].sort((a, b) => b - a);
  for (const round of rounds) {
    const inRound = results.filter((r) => r.roundNumber === round && ids.has(r.userId));
    if (inRound.length === ids.size) {
      return inRound.sort((a, b) => a.placement - b.placement)[0]!.userId;
    }
  }
  return leaders[0]!.userId;
}

/** Whether the series ends after its latest finished round. Manual series end only by the host. */
export function isSeriesOver(
  settings: Pick<SeriesSettings, 'endCondition' | 'targetRounds' | 'targetScore'>,
  roundsPlayed: number,
  standings: readonly SeriesStandingRow[],
): boolean {
  if (settings.endCondition === 'ROUNDS') return roundsPlayed >= (settings.targetRounds ?? 1);
  if (settings.endCondition === 'TARGET_SCORE') {
    return standings.some((row) => row.totalScore >= (settings.targetScore ?? Infinity));
  }
  return false;
}
