import type { ChopResult } from '../contracts/game';
import { type CardId, parseCard, SUIT_SYMBOLS } from './cards';
import type { ChopRecord, MatchOutcome } from './engine';
import type { LeftoverPenalty, LeftoverPenaltyKind } from './hand-analysis';
import type { GameRules, InstantWinKind } from './rules';

/** Engine chop records as clients see them after the match (results and history). */
export function toChopResults(chops: readonly ChopRecord[]): ChopResult[] {
  return chops.map(({ seat, choppedSeat, combination, chopped }) => ({
    seatIndex: seat,
    choppedSeatIndex: choppedSeat,
    combinationType: combination.type,
    cards: combination.cards,
    choppedType: chopped.type,
    choppedCards: chopped.cards,
  }));
}

/** What one player did in a finished round, as stored on `match_players` for statistics. */
export interface RoundStatistics {
  seat: number;
  placement: number;
  roundScore: number;
  penaltyPoints: number;
  /** Cards the player put on the table (0 after an instant win). */
  cardsPlayed: number;
  chopsMade: number;
  /** Chops whose chopped combination was a single 2 or a pair of 2s (chặt heo). */
  twosChopped: number;
  chopsReceived: number;
  /** 2s still held at a normal finish (thúi heo); 0 after an instant win. */
  twosLeft: number;
}

const isTwo = (card: CardId) => parseCard(card).rank === '2';

/** Per-player statistics of a finished round, derived from its outcome only. */
export function roundStatistics(outcome: MatchOutcome, cardsPerPlayer: number): RoundStatistics[] {
  const normal = outcome.reason === 'NORMAL';
  return outcome.placements.map((p) => ({
    seat: p.seat,
    placement: p.placement,
    roundScore: p.roundScore,
    penaltyPoints: p.penaltyPoints,
    cardsPlayed: normal ? cardsPerPlayer - p.remainingCards.length : 0,
    chopsMade: outcome.chops.filter((c) => c.seat === p.seat).length,
    twosChopped: outcome.chops.filter(
      (c) => c.seat === p.seat && c.chopped.cards.every((card) => isTwo(card)),
    ).length,
    chopsReceived: outcome.chops.filter((c) => c.choppedSeat === p.seat).length,
    twosLeft: normal ? p.remainingCards.filter((card) => isTwo(card)).length : 0,
  }));
}

/** Vietnamese names of leftover penalties (docs/GAME_RULES.md §11). */
export const LEFTOVER_PENALTY_LABELS_VI: Readonly<Record<LeftoverPenaltyKind, string>> = {
  BLACK_TWO: 'Thúi heo đen',
  RED_TWO: 'Thúi heo đỏ',
  FOUR_OF_A_KIND: 'Thối tứ quý',
  THREE_CONSECUTIVE_PAIRS: 'Thối 3 đôi thông',
  FOUR_CONSECUTIVE_PAIRS: 'Thối 4 đôi thông',
  REMAINING_CARDS: 'Phạt lá còn lại',
  UNPLAYED_HAND: 'Cóng (chưa đánh lá nào)',
};

/** The rule setting (`rules.leftoverPenalties.*`) behind each penalty kind. */
export const LEFTOVER_PENALTY_RULES: Readonly<
  Record<LeftoverPenaltyKind, keyof GameRules['leftoverPenalties']>
> = {
  BLACK_TWO: 'blackTwo',
  RED_TWO: 'redTwo',
  FOUR_OF_A_KIND: 'fourOfAKind',
  THREE_CONSECUTIVE_PAIRS: 'threeConsecutivePairs',
  FOUR_CONSECUTIVE_PAIRS: 'fourConsecutivePairs',
  REMAINING_CARDS: 'perCard',
  UNPLAYED_HAND: 'unplayedHand',
};

/** A card with its suit symbol: 10♥, 2♠ (`cardLabelVi` spells the suit out). */
export function cardLabel(card: CardId): string {
  const { rank, suit } = parseCard(card);
  return `${rank}${SUIT_SYMBOLS[suit]}`;
}

/** One sentence explaining a penalty item, e.g. "Thúi heo đỏ (2♥): 2 điểm." */
export function describePenalty(item: LeftoverPenalty): string {
  const label = LEFTOVER_PENALTY_LABELS_VI[item.kind];
  const cards =
    item.kind === 'REMAINING_CARDS' || item.kind === 'UNPLAYED_HAND'
      ? `${item.cards.length} lá`
      : item.cards.map(cardLabel).join(' ');
  return `${label} (${cards}): ${item.points} điểm.`;
}

/**
 * The unique key of a penalty record: one per match, seat, kind and set of cards, so storing a
 * round's penalties twice (a retried settlement) can never charge a hand twice.
 */
export function penaltyKey(matchId: string, seat: number, item: LeftoverPenalty): string {
  return `${matchId}:${seat}:${item.kind}:${[...item.cards].sort().join('.')}`;
}

/** Vietnamese names of instant wins (docs/GAME_RULES.md §12). */
export const INSTANT_WIN_LABELS_VI: Readonly<Record<InstantWinKind, string>> = {
  DRAGON_STRAIGHT: 'Sảnh rồng',
  FOUR_TWOS: 'Tứ quý heo',
  FIVE_CONSECUTIVE_PAIRS: 'Năm đôi thông',
  SIX_PAIRS: 'Sáu đôi',
  FOUR_THREES: 'Tứ quý 3',
};
