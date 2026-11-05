import { describe, expect, it } from 'vitest';
import {
  averageOneDecimal,
  computeStreaks,
  dayStart,
  monthStart,
  periodStart,
  winRatePercent,
} from './stats';

describe('winRatePercent', () => {
  it('returns 0 when no matches were played', () => {
    expect(winRatePercent(0, 0)).toBe(0);
  });

  it('rounds to one decimal place', () => {
    expect(winRatePercent(3, 1)).toBe(33.3);
    expect(winRatePercent(4, 4)).toBe(100);
  });

  it('never exceeds 100% even with inconsistent input', () => {
    expect(winRatePercent(2, 5)).toBe(100);
  });
});

describe('computeStreaks', () => {
  it('tracks current and best winning and losing runs, oldest round first', () => {
    expect(computeStreaks([])).toEqual({
      currentWin: 0,
      bestWin: 0,
      currentLoss: 0,
      longestLoss: 0,
    });
    expect(computeStreaks([1, 1, 2, 1, 1, 1, 3, 4])).toEqual({
      currentWin: 0,
      bestWin: 3,
      currentLoss: 2,
      longestLoss: 2,
    });
    expect(computeStreaks([2, 3, 4, 1, 1])).toMatchObject({ currentWin: 2, longestLoss: 3 });
  });
});

describe('periods (Vietnam time)', () => {
  // 2026-11-05 01:30 in Vietnam is still 2026-11-04 in UTC.
  const at = new Date('2026-11-04T18:30:00Z');

  it('starts days and months at Vietnam midnight', () => {
    expect(dayStart(at).toISOString()).toBe('2026-11-04T17:00:00.000Z');
    expect(monthStart(at).toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(periodStart('all', at)).toBeNull();
    expect(periodStart('week', at)!.toISOString()).toBe('2026-11-01T17:00:00.000Z');
  });

  it('averages with one decimal place, never dividing by zero', () => {
    expect(averageOneDecimal(7, 3)).toBe(2.3);
    expect(averageOneDecimal(5, 0)).toBe(0);
  });
});
