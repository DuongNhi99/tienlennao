/**
 * Win rate as a percentage with one decimal place. A "win" is a first-place finish; only
 * FINISHED matches count toward `played`. Zero matches played yields 0 (never NaN).
 */
export function winRatePercent(played: number, won: number): number {
  if (played <= 0) return 0;
  return Math.round((Math.min(won, played) * 1000) / played) / 10;
}
