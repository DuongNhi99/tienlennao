import { type CardId, parseCard, RANKS, sortCards } from './cards';
import { groupByRank } from './combinations';
import type { GameRules, InstantWinKind } from './rules';

const TWO = RANKS.indexOf('2');
const ACE = RANKS.indexOf('A');

/** Start indexes of every run of `length` consecutive ranks (3 to A) with at least two cards. */
function pairRunStarts(counts: readonly number[], length: number): number[] {
  const starts: number[] = [];
  for (let start = 0; start + length - 1 <= ACE; start++) {
    if (counts.slice(start, start + length).every((count) => count >= 2)) starts.push(start);
  }
  return starts;
}

const INSTANT_WIN_TESTS: Readonly<Record<InstantWinKind, (counts: readonly number[]) => boolean>> =
  {
    DRAGON_STRAIGHT: (counts) => counts.slice(0, ACE + 1).every((count) => count >= 1),
    FOUR_TWOS: (counts) => counts[TWO] === 4,
    FIVE_CONSECUTIVE_PAIRS: (counts) => pairRunStarts(counts, 5).length > 0,
    SIX_PAIRS: (counts) => counts.reduce((pairs, count) => pairs + Math.floor(count / 2), 0) >= 6,
    FOUR_THREES: (counts) => counts[0] === 4,
  };

/** The highest-priority enabled instant win in `hand`, or null (docs/GAME_RULES.md §12). */
export function detectInstantWin(
  hand: readonly CardId[],
  enabled: GameRules['instantWins'],
): InstantWinKind | null {
  const counts = groupByRank(hand).map((cards) => cards.length);
  return enabled.find((kind) => INSTANT_WIN_TESTS[kind](counts)) ?? null;
}

export const LEFTOVER_PENALTY_KINDS = [
  'BLACK_TWO',
  'RED_TWO',
  'FOUR_OF_A_KIND',
  'THREE_CONSECUTIVE_PAIRS',
  'FOUR_CONSECUTIVE_PAIRS',
] as const;
export type LeftoverPenaltyKind = (typeof LEFTOVER_PENALTY_KINDS)[number];

export interface LeftoverPenalty {
  kind: LeftoverPenaltyKind;
  cards: CardId[];
  points: number;
}

/**
 * Penalty items for cards still held at the end of a match (docs/GAME_RULES.md §11): each 2;
 * each four of a kind below 2; then each maximal run of 3+ consecutive ranks holding at least
 * two of the remaining cards.
 */
export function scoreLeftoverHand(hand: readonly CardId[], rules: GameRules): LeftoverPenalty[] {
  const weights = rules.leftoverPenalties;
  // Sorted first so every reported card list is deterministic, weakest first.
  const byRank = groupByRank(sortCards(hand, 'rank', rules.suitOrder));
  const items: LeftoverPenalty[] = [];

  for (const card of byRank[TWO]!) {
    const red = ['D', 'H'].includes(parseCard(card).suit);
    items.push({
      kind: red ? 'RED_TWO' : 'BLACK_TWO',
      cards: [card],
      points: red ? weights.redTwo : weights.blackTwo,
    });
  }
  for (let rank = 0; rank <= ACE; rank++) {
    if (byRank[rank]!.length === 4) {
      items.push({ kind: 'FOUR_OF_A_KIND', cards: byRank[rank]!, points: weights.fourOfAKind });
      byRank[rank] = [];
    }
  }
  for (let start = 0; start <= ACE;) {
    let end = start;
    while (end <= ACE && byRank[end]!.length >= 2) end++;
    const length = end - start;
    if (length >= 3) {
      const four = length >= 4;
      items.push({
        kind: four ? 'FOUR_CONSECUTIVE_PAIRS' : 'THREE_CONSECUTIVE_PAIRS',
        cards: byRank.slice(start, end).flatMap((cards) => cards.slice(0, 2)),
        points: four ? weights.fourConsecutivePairs : weights.threeConsecutivePairs,
      });
    }
    start = Math.max(end, start + 1);
  }
  return items;
}
