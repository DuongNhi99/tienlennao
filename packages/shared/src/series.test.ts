import { describe, expect, it } from 'vitest';
import { isSeriesOver, rankSeriesStandings, type SeriesRoundResult, seriesWinner } from './series';

const result = (
  name: string,
  roundNumber: number,
  placement: number,
  roundScore: number,
  penaltyPoints = 0,
): SeriesRoundResult => ({
  userId: `id-${name}`,
  displayName: name,
  roundNumber,
  placement,
  roundScore,
  penaltyPoints,
});

describe('rankSeriesStandings', () => {
  it('adds round scores and ranks by total, then wins, then fewer penalties', () => {
    const standings = rankSeriesStandings([
      result('An', 1, 1, 3),
      result('Bình', 1, 2, 2),
      result('Chi', 1, 3, -1, 2),
      result('An', 2, 3, 1),
      result('Bình', 2, 1, 3),
      result('Chi', 2, 2, 2),
    ]);
    expect(standings.map((s) => [s.rank, s.displayName, s.totalScore, s.roundsWon])).toEqual([
      [1, 'Bình', 5, 1],
      [2, 'An', 4, 1],
      [3, 'Chi', 1, 0],
    ]);
    expect(standings[2]).toMatchObject({ roundsPlayed: 2, penaltyPoints: 2 });
  });

  it('shares ranks for players still equal', () => {
    const standings = rankSeriesStandings([result('An', 1, 1, 3), result('Bình', 2, 1, 3)]);
    expect(standings.map((s) => s.rank)).toEqual([1, 1]);
  });
});

describe('seriesWinner', () => {
  it('breaks a tie at the top by the better place in the latest round both played', () => {
    const results = [
      result('An', 1, 1, 3),
      result('Bình', 1, 2, 2),
      result('An', 2, 2, 2),
      result('Bình', 2, 1, 3),
    ];
    const standings = rankSeriesStandings(results);
    expect(standings.map((s) => s.rank)).toEqual([1, 1]);
    expect(seriesWinner(standings, results)).toBe('id-Bình');
    expect(seriesWinner([], [])).toBeNull();
  });
});

describe('isSeriesOver', () => {
  const standings = rankSeriesStandings([result('An', 1, 1, 12)]);

  it('ends after the target number of rounds, at the target score, or never (manual)', () => {
    const rounds = { endCondition: 'ROUNDS', targetRounds: 3, targetScore: null } as const;
    expect(isSeriesOver(rounds, 2, standings)).toBe(false);
    expect(isSeriesOver(rounds, 3, standings)).toBe(true);
    const score = { endCondition: 'TARGET_SCORE', targetRounds: null, targetScore: 12 } as const;
    expect(isSeriesOver(score, 1, standings)).toBe(true);
    expect(isSeriesOver({ ...score, targetScore: 13 }, 1, standings)).toBe(false);
    const manual = { endCondition: 'MANUAL', targetRounds: null, targetScore: null } as const;
    expect(isSeriesOver(manual, 50, standings)).toBe(false);
  });
});
