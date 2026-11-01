import { describe, expect, it } from 'vitest';
import { ALL_CARD_IDS } from './cards';
import { createDeck, createSeededRandom, dealCards, secureRandom, shuffleDeck } from './deck';

describe('createDeck', () => {
  it('contains exactly the 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck)).toEqual(new Set(ALL_CARD_IDS));
  });

  it('returns a fresh array each time', () => {
    expect(createDeck()).not.toBe(createDeck());
  });
});

describe('shuffleDeck', () => {
  it('returns a permutation and does not mutate the input', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(deck).toEqual(ALL_CARD_IDS);
    expect(shuffled).toHaveLength(52);
    expect(new Set(shuffled)).toEqual(new Set(deck));
    expect(shuffled).not.toEqual(deck); // 1 in 52! chance of a false failure
  });

  it('is deterministic for a seed and differs between seeds', () => {
    const a = shuffleDeck(createDeck(), createSeededRandom(42));
    expect(shuffleDeck(createDeck(), createSeededRandom(42))).toEqual(a);
    expect(shuffleDeck(createDeck(), createSeededRandom(43))).not.toEqual(a);
  });

  it('puts every card in every position with similar frequency', () => {
    // 4,000 seeded shuffles: each card should land first about 4000/52 ≈ 77 times.
    const random = createSeededRandom(7);
    const firstCounts = new Map<string, number>();
    for (let i = 0; i < 4000; i++) {
      const first = shuffleDeck(ALL_CARD_IDS, random)[0]!;
      firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
    }
    expect(firstCounts.size).toBe(52);
    for (const count of firstCounts.values()) expect(count).toBeGreaterThan(30);
  });
});

describe('secureRandom', () => {
  it('stays in range and covers every value', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const value = secureRandom.nextInt(7);
      expect(Number.isInteger(value) && value >= 0 && value < 7).toBe(true);
      seen.add(value);
    }
    expect(seen.size).toBe(7);
    expect(secureRandom.nextInt(1)).toBe(0);
  });

  it('rejects invalid bounds', () => {
    for (const bound of [0, -1, 2.5, 2 ** 32 + 1]) {
      expect(() => secureRandom.nextInt(bound)).toThrow(RangeError);
    }
  });
});

describe('dealCards', () => {
  it('gives four players thirteen cards each with nothing duplicated or lost', () => {
    const hands = dealCards(shuffleDeck(createDeck()));
    expect(hands).toHaveLength(4);
    for (const hand of hands) expect(hand).toHaveLength(13);
    expect(new Set(hands.flat())).toEqual(new Set(ALL_CARD_IDS));
  });

  it('deals one card at a time in seat order', () => {
    const hands = dealCards(createDeck());
    expect(hands[0]!.slice(0, 2)).toEqual(['3S', '4S']);
    expect(hands[3]!.slice(0, 2)).toEqual(['3H', '4H']);
  });

  it('rejects decks with duplicates or too few cards', () => {
    expect(() => dealCards(['3S', ...createDeck().slice(1, 51), '3S'])).toThrow(/duplicate/);
    expect(() => dealCards(createDeck().slice(0, 51))).toThrow(/Not enough/);
  });
});
