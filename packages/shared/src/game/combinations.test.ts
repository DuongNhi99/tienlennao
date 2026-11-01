import { describe, expect, it } from 'vitest';
import { ALL_CARD_IDS, type CardId, parseCard, RANKS } from './cards';
import {
  canBeatCombination,
  classifyCombination,
  type Combination,
  describeCombination,
  listCombinations,
  validateCombination,
} from './combinations';
import { createSeededRandom, shuffleDeck } from './deck';
import { DEFAULT_GAME_RULES, type GameRules } from './rules';

const rules = DEFAULT_GAME_RULES;
const combo = (cards: CardId[], r: GameRules = rules): Combination => {
  const result = classifyCombination(cards, r);
  if (!result) throw new Error(`Not a combination: ${cards.join(' ')}`);
  return result;
};
const beats = (play: CardId[], target: CardId[], r: GameRules = rules) =>
  canBeatCombination(combo(play, r), combo(target, r), r);
const withBombs = (bombs: Partial<GameRules['bombs']>): GameRules => ({
  ...rules,
  bombs: { ...rules.bombs, ...bombs },
});

describe('classifyCombination', () => {
  it.each([
    [['7H'], 'SINGLE'],
    [['2S'], 'SINGLE'],
    [['9S', '9D'], 'PAIR'],
    [['2C', '2H'], 'PAIR'],
    [['KS', 'KC', 'KH'], 'TRIPLE'],
    [['5S', '5C', '5D', '5H'], 'FOUR_OF_A_KIND'],
    [['2S', '2C', '2D', '2H'], 'FOUR_OF_A_KIND'],
    [['3S', '4H', '5D'], 'STRAIGHT'],
    [['QS', 'KD', 'AH'], 'STRAIGHT'],
    [['10S', 'JS', 'QS', 'KS', 'AS'], 'STRAIGHT'],
    [['3S', '3C', '4S', '4D', '5C', '5H'], 'CONSECUTIVE_PAIRS'],
    [['QS', 'QC', 'KS', 'KD', 'AC', 'AH'], 'CONSECUTIVE_PAIRS'],
    [['6S', '6C', '7S', '7D', '8C', '8H', '9S', '9H'], 'CONSECUTIVE_PAIRS'],
  ] as [CardId[], string][])('%j is %s', (cards, type) => {
    expect(classifyCombination(cards, rules)?.type).toBe(type);
  });

  it('accepts the longest straight, 3 to A', () => {
    const dragon = RANKS.slice(0, 12).map((rank) => `${rank}S` as CardId);
    expect(classifyCombination(dragon, rules)?.type).toBe('STRAIGHT');
  });

  it.each([
    ['empty', []],
    ['two unrelated cards', ['3S', '4S']],
    ['pairs of different ranks', ['3S', '3C', '5S', '5C']],
    ['only two consecutive pairs', ['3S', '3C', '4S', '4C']],
    ['a full house', ['3S', '3C', '3D', '4S', '4C']],
    ['a straight with a gap', ['3S', '4S', '6S']],
    ['K-A-2', ['KS', 'AS', '2S']],
    ['A-2-3', ['AS', '2S', '3S']],
    ['2-3-4', ['2S', '3S', '4S']],
    ['3 to 2 (13 cards)', RANKS.map((rank) => `${rank}H`)],
    ['consecutive pairs ending in 2s', ['KS', 'KC', 'AS', 'AC', '2S', '2C']],
    ['a triple inside consecutive pairs', ['3S', '3C', '3D', '4S', '4C', '5S']],
    ['duplicate cards', ['5S', '5S']],
  ] as [string, CardId[]][])('rejects %s', (_, cards) => {
    expect(classifyCombination(cards, rules)).toBeNull();
  });

  it('orders cards weakest first and reports the strongest as top', () => {
    expect(combo(['5H', '3D', '4S'])).toEqual({
      type: 'STRAIGHT',
      cards: ['3D', '4S', '5H'],
      top: '5H',
    });
    expect(combo(['9H', '9S']).top).toBe('9H');
  });

  it('uses the configured suit order to pick the top card', () => {
    const reversed: GameRules = { ...rules, suitOrder: ['H', 'D', 'C', 'S'] };
    expect(combo(['9H', '9S'], reversed).top).toBe('9S');
  });

  it('agrees with an independent definition on every 2- and 3-card selection', () => {
    const rank = (card: CardId) => RANKS.indexOf(parseCard(card).rank);
    const deck = [...ALL_CARD_IDS];
    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        const pair = [deck[i]!, deck[j]!];
        expect(classifyCombination(pair, rules)?.type ?? null).toBe(
          rank(deck[i]!) === rank(deck[j]!) ? 'PAIR' : null,
        );
        for (let k = j + 1; k < deck.length; k++) {
          const ranks = [rank(deck[i]!), rank(deck[j]!), rank(deck[k]!)].sort((a, b) => a - b);
          const expected =
            ranks[0] === ranks[2]
              ? 'TRIPLE'
              : ranks[1] === ranks[0]! + 1 && ranks[2] === ranks[0]! + 2 && ranks[2] < 12
                ? 'STRAIGHT'
                : null;
          expect(classifyCombination([...pair, deck[k]!], rules)?.type ?? null).toBe(expected);
        }
      }
    }
  });
});

describe('validateCombination', () => {
  it('explains why a selection is rejected', () => {
    expect(validateCombination([], rules)).toEqual({ ok: false, violation: 'EMPTY_SELECTION' });
    expect(validateCombination(['3S', '3S'], rules)).toEqual({
      ok: false,
      violation: 'DUPLICATE_CARDS',
    });
    expect(validateCombination(['3S', '9S'], rules)).toEqual({
      ok: false,
      violation: 'INVALID_COMBINATION',
    });
    expect(validateCombination(['3S'], rules)).toMatchObject({ ok: true });
  });
});

describe('canBeatCombination — same shape', () => {
  it('compares singles by rank, then suit', () => {
    expect(beats(['4S'], ['3H'])).toBe(true);
    expect(beats(['3H'], ['4S'])).toBe(false);
    expect(beats(['2S'], ['AH'])).toBe(true);
    expect(beats(['7H'], ['7D'])).toBe(true);
    expect(beats(['7D'], ['7H'])).toBe(false);
    expect(beats(['7D'], ['7D'])).toBe(false);
  });

  it('compares pairs, triples and four of a kind by their top card', () => {
    expect(beats(['8S', '8H'], ['8C', '8D'])).toBe(true);
    expect(beats(['8C', '8D'], ['8S', '8H'])).toBe(false);
    expect(beats(['9S', '9C'], ['8D', '8H'])).toBe(true);
    expect(beats(['5S', '5C', '5D'], ['4S', '4C', '4H'])).toBe(true);
    expect(beats(['6S', '6C', '6D', '6H'], ['5S', '5C', '5D', '5H'])).toBe(true);
    expect(beats(['5S', '5C', '5D', '5H'], ['6S', '6C', '6D', '6H'])).toBe(false);
  });

  it('compares straights of equal length by their top card', () => {
    expect(beats(['5S', '6S', '7H'], ['5C', '6D', '7D'])).toBe(true);
    expect(beats(['5C', '6D', '7D'], ['5S', '6S', '7H'])).toBe(false);
    expect(beats(['QS', 'KS', 'AS'], ['JH', 'QH', 'KH'])).toBe(true);
  });

  it('never compares straights or runs of different lengths', () => {
    expect(beats(['4S', '5S', '6S', '7S'], ['3S', '4C', '5C'])).toBe(false);
    expect(beats(['8S', '9S', '10S'], ['3S', '4C', '5C', '6C'])).toBe(false);
    expect(
      beats(
        ['9S', '9C', '10S', '10C', 'JS', 'JC'],
        ['3S', '3C', '4S', '4C', '5S', '5C', '6S', '6C'],
      ),
    ).toBe(false);
  });

  it('never compares different types without a bomb rule', () => {
    expect(beats(['9S', '9C'], ['3S'])).toBe(false);
    expect(beats(['3S', '4S', '5S'], ['KS', 'KC', 'KH'])).toBe(false);
    expect(beats(['AS', 'AC', 'AD'], ['3S', '3C'])).toBe(false);
    expect(beats(['3S', '3C', '3D', '3H'], ['AS'])).toBe(false);
  });
});

describe('canBeatCombination — bombs', () => {
  const singleTwo: CardId[] = ['2H'];
  const pairOfTwos: CardId[] = ['2D', '2H'];
  const tripleTwos: CardId[] = ['2C', '2D', '2H'];
  const threePairs: CardId[] = ['4S', '4C', '5S', '5C', '6S', '6C'];
  const higherThreePairs: CardId[] = ['9S', '9C', '10S', '10C', 'JS', 'JC'];
  const quad: CardId[] = ['7S', '7C', '7D', '7H'];
  const fourPairs: CardId[] = ['3S', '3C', '4D', '4H', '5D', '5H', '6D', '6H'];
  const higherFourPairs: CardId[] = ['8S', '8C', '9D', '9H', '10D', '10H', 'JD', 'JH'];
  const fivePairs: CardId[] = ['8S', '8C', '9D', '9H', '10D', '10H', 'JD', 'JH', 'QS', 'QC'];

  it('three consecutive pairs beat a single 2, but not a pair of 2s', () => {
    expect(beats(threePairs, singleTwo)).toBe(true);
    expect(beats(threePairs, pairOfTwos)).toBe(false);
    expect(beats(threePairs, ['AH'])).toBe(false);
    expect(beats(higherThreePairs, threePairs)).toBe(true);
    expect(beats(threePairs, quad)).toBe(false);
  });

  it('four of a kind beats a single 2, a pair of 2s and three consecutive pairs', () => {
    expect(beats(quad, singleTwo)).toBe(true);
    expect(beats(quad, pairOfTwos)).toBe(true);
    expect(beats(quad, threePairs)).toBe(true);
    expect(beats(quad, fourPairs)).toBe(false);
    expect(beats(quad, tripleTwos)).toBe(false);
  });

  it('four or more consecutive pairs beat everything below them', () => {
    for (const target of [singleTwo, pairOfTwos, threePairs, quad]) {
      expect(beats(fourPairs, target)).toBe(true);
    }
    expect(beats(higherFourPairs, fourPairs)).toBe(true);
    expect(beats(fivePairs, higherFourPairs)).toBe(true);
    expect(beats(higherFourPairs, fivePairs)).toBe(false);
    expect(beats(fourPairs, tripleTwos)).toBe(false);
  });

  it('nothing beats a triple of 2s', () => {
    for (const play of [threePairs, quad, fourPairs, fivePairs]) {
      expect(beats(play, tripleTwos)).toBe(false);
    }
  });

  it('disabling a bomb removes only its special beats', () => {
    const noThree = withBombs({ threeConsecutivePairs: false });
    expect(beats(threePairs, singleTwo, noThree)).toBe(false);
    expect(beats(higherThreePairs, threePairs, noThree)).toBe(true);

    const noQuad = withBombs({ fourOfAKind: false });
    expect(beats(quad, singleTwo, noQuad)).toBe(false);
    expect(beats(quad, threePairs, noQuad)).toBe(false);
    expect(beats(['8S', '8C', '8D', '8H'], quad, noQuad)).toBe(true);

    const noFour = withBombs({ fourConsecutivePairs: false });
    expect(beats(fourPairs, pairOfTwos, noFour)).toBe(false);
    expect(beats(fourPairs, quad, noFour)).toBe(false);
    expect(beats(fivePairs, fourPairs, noFour)).toBe(false);
    // A longer run keeps the three-pair power.
    expect(beats(fourPairs, singleTwo, noFour)).toBe(true);
    expect(beats(fourPairs, singleTwo, withBombs({ threeConsecutivePairs: false }))).toBe(true);
    expect(
      beats(
        fourPairs,
        singleTwo,
        withBombs({ threeConsecutivePairs: false, fourConsecutivePairs: false }),
      ),
    ).toBe(false);
  });
});

describe('listCombinations', () => {
  const powerSet = (hand: CardId[]) =>
    Array.from({ length: 2 ** hand.length }, (_, mask) =>
      hand.filter((__, i) => mask & (1 << i)),
    ).slice(1);
  const key = (c: Combination) => c.cards.join(' ');

  it('finds exactly the valid subsets of a hand', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const hand = shuffleDeck(ALL_CARD_IDS, createSeededRandom(seed)).slice(0, 13);
      const expected = powerSet(hand)
        .map((cards) => classifyCombination(cards, rules))
        .filter((c): c is Combination => c !== null)
        .map(key)
        .sort();
      const listed = listCombinations(hand, rules).map(key).sort();
      expect(listed).toEqual(expected);
    }
  });

  it('enumerates every straight and run choice in a dense hand', () => {
    const hand: CardId[] = ['3S', '3C', '4S', '4C', '5S', '5C', '6S'];
    const expected = powerSet(hand)
      .map((cards) => classifyCombination(cards, rules))
      .filter((c): c is Combination => c !== null);
    expect(listCombinations(hand, rules)).toHaveLength(expected.length);
    expect(listCombinations(hand, rules).map(key)).toContain('3S 3C 4S 4C 5S 5C');
  });
});

describe('describeCombination', () => {
  it('labels combinations in Vietnamese', () => {
    expect(describeCombination(combo(['3S', '4S', '5S', '6S', '7S']))).toBe('Sảnh 5 lá');
    expect(describeCombination(combo(['3S', '3C', '4S', '4C', '5S', '5C']))).toBe('3 đôi thông');
    expect(describeCombination(combo(['9S', '9C', '9D', '9H']))).toBe('Tứ quý');
  });
});
