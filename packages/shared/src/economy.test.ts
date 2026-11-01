import { describe, expect, it } from 'vitest';
import {
  calculatePayouts,
  dailyRewardAmount,
  nextRewardDayStart,
  nextStreakDay,
  previousRewardDay,
  rewardDayKey,
  weekStart,
} from './economy';

describe('calculatePayouts', () => {
  it('splits the pool 50/30/20/0', () => {
    expect(calculatePayouts(100)).toEqual([200, 120, 80, 0]);
    expect(calculatePayouts(5000)).toEqual([10_000, 6000, 4000, 0]);
  });

  it('gives rounding remainders to 1st place and always pays the whole pool', () => {
    expect(calculatePayouts(1)).toEqual([3, 1, 0, 0]);
    for (const fee of [0, 1, 3, 7, 99, 101, 333, 1234]) {
      const payouts = calculatePayouts(fee);
      expect(payouts.reduce((a, b) => a + b, 0)).toBe(fee * 4);
      expect(payouts.every((p) => Number.isInteger(p) && p >= 0)).toBe(true);
    }
  });

  it('rejects negative or fractional fees', () => {
    expect(() => calculatePayouts(-1)).toThrow(RangeError);
    expect(() => calculatePayouts(1.5)).toThrow(RangeError);
  });
});

describe('reward days (Asia/Ho_Chi_Minh, UTC+7)', () => {
  it('changes day at Vietnam midnight', () => {
    expect(rewardDayKey(new Date('2026-11-01T16:59:59Z'))).toBe('2026-11-01');
    expect(rewardDayKey(new Date('2026-11-01T17:00:00Z'))).toBe('2026-11-02');
    expect(nextRewardDayStart(new Date('2026-11-01T10:00:00Z')).toISOString()).toBe(
      '2026-11-01T17:00:00.000Z',
    );
    expect(nextRewardDayStart(new Date('2026-11-01T17:00:00Z')).toISOString()).toBe(
      '2026-11-02T17:00:00.000Z',
    );
  });

  it('finds the previous day across month and year boundaries', () => {
    expect(previousRewardDay('2026-03-01')).toBe('2026-02-28');
    expect(previousRewardDay('2027-01-01')).toBe('2026-12-31');
  });
});

describe('weekStart', () => {
  it('returns Monday 00:00 in Vietnam time', () => {
    // Sunday 2026-11-01 23:30 in Vietnam → the week began Monday 2026-10-26.
    expect(weekStart(new Date('2026-11-01T16:30:00Z')).toISOString()).toBe(
      '2026-10-25T17:00:00.000Z',
    );
    // Monday 2026-11-02 00:00 in Vietnam starts a new week.
    expect(weekStart(new Date('2026-11-01T17:00:00Z')).toISOString()).toBe(
      '2026-11-01T17:00:00.000Z',
    );
  });
});

describe('streaks', () => {
  it('continues on consecutive days, caps at 7 and resets after a gap', () => {
    expect(nextStreakDay('2026-11-02', null)).toBe(1);
    expect(nextStreakDay('2026-11-02', { dayKey: '2026-11-01', streakDay: 1 })).toBe(2);
    expect(nextStreakDay('2026-11-02', { dayKey: '2026-11-01', streakDay: 7 })).toBe(7);
    expect(nextStreakDay('2026-11-03', { dayKey: '2026-11-01', streakDay: 4 })).toBe(1);
    expect(dailyRewardAmount(3)).toBe(300);
  });
});
