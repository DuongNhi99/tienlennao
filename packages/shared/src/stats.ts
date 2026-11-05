import { REWARD_TIME_ZONE, weekStart } from './economy';

/**
 * Win rate as a percentage with one decimal place. A "win" is a first-place finish; only
 * FINISHED matches count toward `played`. Zero matches played yields 0 (never NaN).
 */
export function winRatePercent(played: number, won: number): number {
  if (played <= 0) return 0;
  return Math.round((Math.min(won, played) * 1000) / played) / 10;
}

/** `total / count` with one decimal place; 0 when there is nothing to divide. */
export function averageOneDecimal(total: number, count: number): number {
  if (count <= 0) return 0;
  return Math.round((total * 10) / count) / 10;
}

export interface Streaks {
  /** Consecutive wins (1st place) ending with the latest round. */
  currentWin: number;
  bestWin: number;
  /** Consecutive rounds without a win ending with the latest round. */
  currentLoss: number;
  longestLoss: number;
}

/**
 * Winning and losing streaks from placements in the order the rounds finished (oldest first).
 * Statistics are round-based: a round is won by finishing 1st and lost otherwise.
 */
export function computeStreaks(placements: readonly number[]): Streaks {
  const streaks: Streaks = { currentWin: 0, bestWin: 0, currentLoss: 0, longestLoss: 0 };
  for (const placement of placements) {
    if (placement === 1) {
      streaks.currentWin += 1;
      streaks.currentLoss = 0;
      streaks.bestWin = Math.max(streaks.bestWin, streaks.currentWin);
    } else {
      streaks.currentLoss += 1;
      streaks.currentWin = 0;
      streaks.longestLoss = Math.max(streaks.longestLoss, streaks.currentLoss);
    }
  }
  return streaks;
}

const VIETNAM_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

/** Start of the Vietnam calendar day containing `at` (statistics periods, like rewards). */
export function dayStart(at: Date): Date {
  return new Date(
    Math.floor((at.getTime() + VIETNAM_OFFSET_MS) / DAY_MS) * DAY_MS - VIETNAM_OFFSET_MS,
  );
}

/** Start of the Vietnam calendar month containing `at`. */
export function monthStart(at: Date): Date {
  const local = new Date(at.getTime() + VIETNAM_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - VIETNAM_OFFSET_MS);
}

/** Start of a leaderboard period in Vietnam time (`REWARD_TIME_ZONE`), or null for all time. */
export function periodStart(period: 'today' | 'week' | 'month' | 'all', at: Date): Date | null {
  if (period === 'today') return dayStart(at);
  if (period === 'week') return weekStart(at);
  if (period === 'month') return monthStart(at);
  return null;
}

/** For documentation and the UI: periods are calendar periods in this time zone. */
export const STATISTICS_TIME_ZONE = REWARD_TIME_ZONE;
