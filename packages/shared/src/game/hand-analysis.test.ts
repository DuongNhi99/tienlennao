import { describe, expect, it } from 'vitest';
import type { CardId } from './cards';
import { detectInstantWin, scoreLeftoverHand } from './hand-analysis';
import { DEFAULT_GAME_RULES, type InstantWinKind } from './rules';

const hand = (text: string) => text.split(' ') as CardId[];

describe('detectInstantWin', () => {
  it.each([
    ['DRAGON_STRAIGHT', '3S 4C 5D 6H 7S 8C 9D 10H JS QC KD AH 2S'],
    ['FOUR_TWOS', '2S 2C 2D 2H 3S 5C 7D 9H JS KC AD 4H 6S'],
    ['FIVE_CONSECUTIVE_PAIRS', '5S 5C 6S 6C 7S 7C 8S 8C 9S 9C JD KH 2S'],
    ['SIX_PAIRS', '3S 3C 5S 5C 7S 7C 9S 9C JS JC KS KC 2H'],
    ['FOUR_THREES', '3S 3C 3D 3H 5S 7C 9D JH KS AC 2D 4H 6D'],
  ] as [InstantWinKind, string][])('detects %s', (kind, cards) => {
    expect(detectInstantWin(hand(cards), [kind])).toBe(kind);
  });

  it('counts a four of a kind as two pairs', () => {
    expect(detectInstantWin(hand('3S 3C 3D 3H 5S 5C 7S 7C 9S 9C KS KC 2H'), ['SIX_PAIRS'])).toBe(
      'SIX_PAIRS',
    );
    expect(detectInstantWin(hand('3S 3C 3D 3H 5S 5C 7S 7C 9S 9C KS QC 2H'), ['SIX_PAIRS'])).toBe(
      null,
    );
  });

  it('does not count 2s in five consecutive pairs', () => {
    const cards = hand('JS JC QS QC KS KC AS AC 2S 2C 4D 6H 8D');
    expect(detectInstantWin(cards, ['FIVE_CONSECUTIVE_PAIRS'])).toBeNull();
  });

  it('needs every rank from 3 to A for a dragon', () => {
    const missingAce = hand('3S 4C 5D 6H 7S 8C 9D 10H JS QC KD KH 2S');
    expect(detectInstantWin(missingAce, ['DRAGON_STRAIGHT'])).toBeNull();
  });

  it('returns the highest-priority enabled kind', () => {
    // Four 2s and six pairs at once.
    const cards = hand('2S 2C 2D 2H 3S 3C 5S 5C 7S 7C 9S 9C KS');
    expect(detectInstantWin(cards, ['SIX_PAIRS', 'FOUR_TWOS'])).toBe('SIX_PAIRS');
    expect(detectInstantWin(cards, ['FOUR_TWOS', 'SIX_PAIRS'])).toBe('FOUR_TWOS');
    expect(detectInstantWin(cards, ['DRAGON_STRAIGHT'])).toBeNull();
    expect(detectInstantWin(cards, [])).toBeNull();
  });

  it('enables every kind except four 3s by default', () => {
    expect(DEFAULT_GAME_RULES.instantWins).not.toContain('FOUR_THREES');
    const fourThrees = hand('3S 3C 3D 3H 5S 7C 9D JH KS AC 2D 4H 6D');
    expect(detectInstantWin(fourThrees, DEFAULT_GAME_RULES.instantWins)).toBeNull();
  });
});

describe('scoreLeftoverHand', () => {
  const score = (cards: string) =>
    scoreLeftoverHand(hand(cards), DEFAULT_GAME_RULES).map(({ kind, cards: c, points }) => [
      kind,
      c.join(' '),
      points,
    ]);

  it('scores nothing for a hand without 2s or bombs', () => {
    expect(score('3S 5C 7D 9H')).toEqual([]);
    expect(scoreLeftoverHand([], DEFAULT_GAME_RULES)).toEqual([]);
  });

  it('scores black and red 2s separately', () => {
    expect(score('2H 4S 2S 2C')).toEqual([
      ['BLACK_TWO', '2S', 1],
      ['BLACK_TWO', '2C', 1],
      ['RED_TWO', '2H', 2],
    ]);
  });

  it('scores four of a kind, and four 2s only as four 2s', () => {
    expect(score('9S 9C 9D 9H 3S')).toEqual([['FOUR_OF_A_KIND', '9S 9C 9D 9H', 4]]);
    expect(score('2S 2C 2D 2H').map(([kind]) => kind)).toEqual([
      'BLACK_TWO',
      'BLACK_TWO',
      'RED_TWO',
      'RED_TWO',
    ]);
  });

  it('scores runs of three and of four or more consecutive pairs', () => {
    expect(score('4S 4C 5S 5C 6S 6C 9H')).toEqual([
      ['THREE_CONSECUTIVE_PAIRS', '4S 4C 5S 5C 6S 6C', 3],
    ]);
    expect(score('4S 4C 5S 5C 6S 6C 7D 7H 8S 8C')).toEqual([
      ['FOUR_CONSECUTIVE_PAIRS', '4S 4C 5S 5C 6S 6C 7D 7H 8S 8C', 6],
    ]);
    expect(score('4S 4C 5S 5C 6S 6C 6D 9S 9C 10S 10C JS JC')).toEqual([
      ['THREE_CONSECUTIVE_PAIRS', '4S 4C 5S 5C 6S 6C', 3],
      ['THREE_CONSECUTIVE_PAIRS', '9S 9C 10S 10C JS JC', 3],
    ]);
  });

  it('does not reuse four-of-a-kind cards in a run, and never runs through 2s', () => {
    expect(score('5S 5C 5D 5H 6S 6C 7S 7C')).toEqual([['FOUR_OF_A_KIND', '5S 5C 5D 5H', 4]]);
    expect(score('KS KC AS AC 2S 2C').map(([kind]) => kind)).toEqual(['BLACK_TWO', 'BLACK_TWO']);
  });

  it('uses the configured weights', () => {
    const rules = {
      ...DEFAULT_GAME_RULES,
      leftoverPenalties: { ...DEFAULT_GAME_RULES.leftoverPenalties, redTwo: 0, fourOfAKind: 10 },
    };
    const items = scoreLeftoverHand(hand('2H 9S 9C 9D 9H'), rules);
    expect(items.map((item) => item.points)).toEqual([0, 10]);
  });
});
