import { describe, expect, it } from 'vitest';
import { type LeaderboardRow, matchesSearch, rankLeaderboard } from './leaderboard';

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

describe('rankLeaderboard (points, streaks, chops, penalties)', () => {
  const full = (
    name: string,
    fields: {
      wins?: number;
      played: number;
      points?: number;
      bestStreak?: number;
      chops?: number;
      penaltyPoints?: number;
    },
  ): LeaderboardRow => ({ userId: `id-${name}`, displayName: name, wins: 0, ...fields });
  const rows = [
    full('An', { wins: 4, played: 10, points: 18, bestStreak: 2, chops: 3, penaltyPoints: 10 }),
    full('Bình', { wins: 2, played: 10, points: 18, bestStreak: 2, chops: 3, penaltyPoints: 5 }),
    full('Chi', { wins: 1, played: 4, points: 7, bestStreak: 1, chops: 0, penaltyPoints: 0 }),
  ];

  it('ranks points, breaking ties by more wins', () => {
    expect(summary(rankLeaderboard(rows, 'points', 0))).toEqual(['1:An', '2:Bình', '3:Chi']);
  });

  it('lists only players who chopped, fewer rounds first on a tie', () => {
    expect(summary(rankLeaderboard(rows, 'chops', 0))).toEqual(['1:An', '1:Bình']);
  });

  it('ranks the lowest average penalty above the minimum number of rounds', () => {
    const ranked = rankLeaderboard(rows, 'lowPenalty', 5);
    expect(summary(ranked)).toEqual(['1:Bình', '2:An']);
    expect(ranked.map((r) => r.averagePenalty)).toEqual([0.5, 1]);
    expect(summary(rankLeaderboard(rows, 'lowPenalty', 0))[0]).toBe('1:Chi');
  });

  it('ranks the best streak, breaking ties by wins', () => {
    expect(summary(rankLeaderboard(rows, 'bestStreak', 0))).toEqual(['1:An', '2:Bình', '3:Chi']);
  });
});

describe('matchesSearch', () => {
  it('ignores case and Vietnamese accents', () => {
    expect(matchesSearch('Nguyễn Văn Đức', 'duc')).toBe(true);
    expect(matchesSearch('Nguyễn Văn Đức', 'VAN')).toBe(true);
    expect(matchesSearch('Bình', 'an')).toBe(false);
  });
});
