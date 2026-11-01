import { PLAYERS_PER_MATCH } from './constants/game';

/**
 * Coin rules from docs/ECONOMY.md. All amounts are whole virtual coins; no floating point.
 */

/** Share of the pool per placement (1st … 4th), in basis points. Sums to 10 000. */
export const PAYOUT_SHARES_BPS: readonly number[] = [5000, 3000, 2000, 0];

/**
 * Payout per placement (index 0 = 1st). Each share is rounded down and the remainder goes to
 * 1st place, so the payouts always add up to the whole pool (four entry fees).
 */
export function calculatePayouts(entryFee: number): number[] {
  if (!Number.isSafeInteger(entryFee) || entryFee < 0) {
    throw new RangeError(`Invalid entry fee: ${entryFee}`);
  }
  const pool = entryFee * PLAYERS_PER_MATCH;
  const payouts = PAYOUT_SHARES_BPS.map((bps) => Math.floor((pool * bps) / 10_000));
  payouts[0]! += pool - payouts.reduce((sum, payout) => sum + payout, 0);
  return payouts;
}

/** Daily reward: 100 coins × streak day, streak capped at 7 (docs/ECONOMY.md). */
export const DAILY_REWARD_PER_DAY = 100;
export const DAILY_REWARD_MAX_STREAK = 7;
export const REWARD_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/** Vietnam has no daylight saving time: UTC+7 all year. */
const VIETNAM_OFFSET_MS = 7 * 3600_000;
const DAY_MS = 86_400_000;

/** The reward day for an instant, as `YYYY-MM-DD` in Vietnam time. */
export function rewardDayKey(at: Date): string {
  return new Date(at.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

/** The reward day before `dayKey`. */
export function previousRewardDay(dayKey: string): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/** Start of the next reward day (Vietnam midnight) after `at`. */
export function nextRewardDayStart(at: Date): Date {
  return new Date(
    (Math.floor((at.getTime() + VIETNAM_OFFSET_MS) / DAY_MS) + 1) * DAY_MS - VIETNAM_OFFSET_MS,
  );
}

/**
 * The streak day a claim on `today` counts as, given the last claim (day and streak day).
 * Claiming the day after the last claim continues the streak; otherwise it starts over.
 */
export function nextStreakDay(
  today: string,
  last: { dayKey: string; streakDay: number } | null,
): number {
  if (!last || last.dayKey !== previousRewardDay(today)) return 1;
  return Math.min(last.streakDay + 1, DAILY_REWARD_MAX_STREAK);
}

export function dailyRewardAmount(streakDay: number): number {
  return DAILY_REWARD_PER_DAY * streakDay;
}
