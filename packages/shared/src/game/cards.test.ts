import { describe, expect, it } from 'vitest';
import {
  ALL_CARD_IDS,
  type CardId,
  cardIdSchema,
  cardLabelVi,
  compareCards,
  isRedSuit,
  parseCard,
  sortCards,
  toCardId,
} from './cards';

describe('card identifiers', () => {
  it('defines exactly 52 unique cards', () => {
    expect(ALL_CARD_IDS).toHaveLength(52);
    expect(new Set(ALL_CARD_IDS).size).toBe(52);
  });

  it('round-trips between id and card, including the two-character rank 10', () => {
    for (const id of ALL_CARD_IDS) expect(toCardId(parseCard(id))).toBe(id);
    expect(parseCard('10H')).toEqual({ rank: '10', suit: 'H' });
  });

  it('validates ids with the schema', () => {
    expect(cardIdSchema.safeParse('10H').success).toBe(true);
    expect(cardIdSchema.safeParse('1H').success).toBe(false);
    expect(cardIdSchema.safeParse('3X').success).toBe(false);
  });

  it('labels cards in Vietnamese and identifies red suits', () => {
    expect(cardLabelVi('AS')).toBe('A bích');
    expect(cardLabelVi('10H')).toBe('10 cơ');
    expect(isRedSuit('H')).toBe(true);
    expect(isRedSuit('C')).toBe(false);
  });
});

describe('card ordering', () => {
  it('orders 3♠ lowest and 2♥ highest', () => {
    const sorted = sortCards(ALL_CARD_IDS);
    expect(sorted[0]).toBe('3S');
    expect(sorted.at(-1)).toBe('2H');
  });

  it('breaks rank ties by suit ♠ < ♣ < ♦ < ♥', () => {
    expect(sortCards(['7H', '7S', '7D', '7C'])).toEqual(['7S', '7C', '7D', '7H']);
    expect(compareCards('2S', 'AH')).toBeGreaterThan(0);
  });

  it('groups by suit in suit mode', () => {
    const hand: CardId[] = ['2H', '3H', 'KS', '5D', '3S', 'QC'];
    expect(sortCards(hand, 'suit')).toEqual(['3S', 'KS', 'QC', '5D', '3H', '2H']);
  });

  it('does not mutate its input', () => {
    const hand: CardId[] = ['2H', '3S'];
    sortCards(hand);
    expect(hand).toEqual(['2H', '3S']);
  });

  it('respects a custom suit order', () => {
    expect(sortCards(['9S', '9H'], 'rank', ['H', 'D', 'C', 'S'])).toEqual(['9H', '9S']);
  });
});
