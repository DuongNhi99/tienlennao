import { describe, expect, it } from 'vitest';
import { winRatePercent } from './stats';

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
