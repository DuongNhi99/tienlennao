import { z } from 'zod';

/** Rank order in Tiến Lên Miền Nam, lowest to highest. The 2 ("heo") is the highest rank. */
export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] as const;
export type Rank = (typeof RANKS)[number];

/**
 * Default suit order, lowest to highest: ♠ bích < ♣ chuồn < ♦ rô < ♥ cơ.
 * The rules engine (Phase 4) accepts a configurable order; this is the default preset.
 */
export const SUITS = ['S', 'C', 'D', 'H'] as const;
export type Suit = (typeof SUITS)[number];

/** Compact card identifier, e.g. "3S", "10H", "2D". Used in all wire formats. */
export type CardId = `${Rank}${Suit}`;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const ALL_CARD_IDS: readonly CardId[] = RANKS.flatMap((rank) =>
  SUITS.map((suit): CardId => `${rank}${suit}`),
);

export const cardIdSchema = z.enum(ALL_CARD_IDS as [CardId, ...CardId[]]);

export const SUIT_SYMBOLS: Readonly<Record<Suit, string>> = { S: '♠', C: '♣', D: '♦', H: '♥' };
export const SUIT_NAMES_VI: Readonly<Record<Suit, string>> = {
  S: 'bích',
  C: 'chuồn',
  D: 'rô',
  H: 'cơ',
};

export function isRedSuit(suit: Suit): boolean {
  return suit === 'D' || suit === 'H';
}

export function parseCard(id: CardId): Card {
  return { rank: id.slice(0, -1) as Rank, suit: id.slice(-1) as Suit };
}

export function toCardId(card: Card): CardId {
  return `${card.rank}${card.suit}`;
}

/** Total order over the 52 cards: rank first, then suit. Higher value = stronger card. */
export function cardStrength(id: CardId, suitOrder: readonly Suit[] = SUITS): number {
  const { rank, suit } = parseCard(id);
  return RANKS.indexOf(rank) * SUITS.length + suitOrder.indexOf(suit);
}

export function compareCards(a: CardId, b: CardId, suitOrder: readonly Suit[] = SUITS): number {
  return cardStrength(a, suitOrder) - cardStrength(b, suitOrder);
}

export type CardSortMode = 'rank' | 'suit';

/**
 * Returns a new sorted array. `rank` orders by strength (3♠ … 2♥); `suit` groups cards by suit
 * (in suit order) and orders each group by rank. Never mutates the input.
 */
export function sortCards(
  cards: readonly CardId[],
  mode: CardSortMode = 'rank',
  suitOrder: readonly Suit[] = SUITS,
): CardId[] {
  const sorted = [...cards];
  if (mode === 'rank') {
    return sorted.sort((a, b) => compareCards(a, b, suitOrder));
  }
  return sorted.sort((a, b) => {
    const ca = parseCard(a);
    const cb = parseCard(b);
    const bySuit = suitOrder.indexOf(ca.suit) - suitOrder.indexOf(cb.suit);
    return bySuit !== 0 ? bySuit : RANKS.indexOf(ca.rank) - RANKS.indexOf(cb.rank);
  });
}

/** Human-readable Vietnamese label, e.g. "10 cơ", "A bích" (used for accessible names). */
export function cardLabelVi(id: CardId): string {
  const { rank, suit } = parseCard(id);
  return `${rank} ${SUIT_NAMES_VI[suit]}`;
}
