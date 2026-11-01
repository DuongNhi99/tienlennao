import { describe, expect, it } from 'vitest';
import { type LeaderboardRow, rankLeaderboard } from './leaderboard';

const row = (name: string, wins: number, played: number): LeaderboardRow => ({
  userId: `id-${name}`,
  displayName: name,
  wins,
  played,
});
const summary = (rows: ReturnType<typeof rankLeaderboard>) =>
  rows.map((r) => `${r.rank}:${r.displayName}`);

describe('rankLeaderboard', () => {
  const rows = [
    row('An', 5, 10),
    row('Bình', 5, 8),
    row('Chi', 3, 3),
    row('Dũng', 0, 12),
    row('Em', 5, 8),
  ];

  it('ranks wins, breaking ties by fewer matches, and shares equal ranks', () => {
    expect(summary(rankLeaderboard(rows, 'wins', 0))).toEqual(['1:Bình', '1:Em', '3:An', '4:Chi']);
  });

  it('ranks win rate exactly, only above the minimum number of matches', () => {
    // Chi (100 %) has too few matches; Bình and Em (62.5 %) beat An (50 %); Dũng has 0 %.
    const ranked = rankLeaderboard(rows, 'winRate', 5);
    expect(summary(ranked)).toEqual(['1:Bình', '1:Em', '3:An', '4:Dũng']);
    expect(ranked[0]!.winRate).toBe(62.5);
  });

  it('ranks matches played, breaking ties by wins', () => {
    expect(summary(rankLeaderboard(rows, 'played', 0))).toEqual([
      '1:Dũng',
      '2:An',
      '3:Bình',
      '3:Em',
      '5:Chi',
    ]);
  });

  it('compares win rates without rounding', () => {
    // 2/3 (66.67 %) beats 666/1000 (66.6 %).
    const ranked = rankLeaderboard([row('X', 666, 1000), row('Y', 2, 3)], 'winRate', 1);
    expect(summary(ranked)).toEqual(['1:Y', '2:X']);
  });

  it('returns nothing for no rows', () => {
    expect(rankLeaderboard([], 'wins', 0)).toEqual([]);
  });
});
