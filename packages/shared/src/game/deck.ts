import { CARDS_PER_PLAYER, PLAYERS_PER_MATCH } from '../constants/game';
import { ALL_CARD_IDS, type CardId } from './cards';

export interface RandomSource {
  /** A uniformly distributed integer in [0, maxExclusive). */
  nextInt(maxExclusive: number): number;
}

const UINT32_RANGE = 2 ** 32;

/**
 * Production randomness: the platform CSPRNG (Web Crypto, available in Node 20+ and browsers),
 * with rejection sampling so every result is equally likely.
 */
export const secureRandom: RandomSource = {
  nextInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
      throw new RangeError(`maxExclusive must be an integer in [1, 2^32], got ${maxExclusive}`);
    }
    const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
    const buffer = new Uint32Array(1);
    for (;;) {
      globalThis.crypto.getRandomValues(buffer);
      if (buffer[0]! < limit) return buffer[0]! % maxExclusive;
    }
  },
};

/** Deterministic PRNG (mulberry32). FOR TESTS ONLY — never for real deals. */
export function createSeededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return {
    nextInt(maxExclusive) {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / UINT32_RANGE) * maxExclusive);
    },
  };
}

/** A new, ordered 52-card deck. */
export function createDeck(): CardId[] {
  return [...ALL_CARD_IDS];
}

/** Fisher–Yates shuffle into a new array. Defaults to the secure random source. */
export function shuffleDeck(
  deck: readonly CardId[],
  random: RandomSource = secureRandom,
): CardId[] {
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = random.nextInt(i + 1);
    [cards[i], cards[j]] = [cards[j]!, cards[i]!];
  }
  return cards;
}

/** Deals one card at a time in seat order (card i goes to seat i mod players). */
export function dealCards(
  deck: readonly CardId[],
  players: number = PLAYERS_PER_MATCH,
  cardsPerPlayer: number = CARDS_PER_PLAYER,
): CardId[][] {
  if (new Set(deck).size !== deck.length) throw new Error('The deck contains duplicate cards.');
  if (deck.length < players * cardsPerPlayer) throw new Error('Not enough cards to deal.');
  const hands: CardId[][] = Array.from({ length: players }, () => []);
  for (let i = 0; i < players * cardsPerPlayer; i++) hands[i % players]!.push(deck[i]!);
  return hands;
}
