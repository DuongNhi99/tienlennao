import { describe, expect, it } from 'vitest';
import { formatCoinDelta, formatCoins, formatRelativeTime, shortId } from '@/lib/format';

describe('format', () => {
  it('groups coins the Vietnamese way', () => {
    expect(formatCoins(12500)).toBe('12.500');
    expect(formatCoins(0)).toBe('0');
  });

  it('signs coin deltas explicitly', () => {
    expect(formatCoinDelta(300)).toBe('+300');
    expect(formatCoinDelta(-1000)).toBe('−1.000');
    expect(formatCoinDelta(0)).toBe('0');
  });

  it('formats relative times against an injected clock', () => {
    const now = Date.parse('2026-10-27T10:00:00Z');
    expect(formatRelativeTime('2026-10-27T09:55:00Z', now)).toMatch(/5 phút trước/);
    expect(formatRelativeTime('2026-10-26T10:00:00Z', now)).toMatch(/hôm qua/i);
  });

  it('shortens ids for display', () => {
    expect(shortId('00000000-0000-4000-8000-000000000001')).toBe('00000000');
  });
});
