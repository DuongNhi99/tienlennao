import type { ChopResult } from '../contracts/game';
import type { ChopRecord } from './engine';
import type { LeftoverPenaltyKind } from './hand-analysis';
import type { InstantWinKind } from './rules';

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

/** Vietnamese names of leftover penalties (docs/GAME_RULES.md §11). */
export const LEFTOVER_PENALTY_LABELS_VI: Readonly<Record<LeftoverPenaltyKind, string>> = {
  BLACK_TWO: 'Thúi heo đen',
  RED_TWO: 'Thúi heo đỏ',
  FOUR_OF_A_KIND: 'Thối tứ quý',
  THREE_CONSECUTIVE_PAIRS: 'Thối 3 đôi thông',
  FOUR_CONSECUTIVE_PAIRS: 'Thối 4 đôi thông',
};

/** Vietnamese names of instant wins (docs/GAME_RULES.md §12). */
export const INSTANT_WIN_LABELS_VI: Readonly<Record<InstantWinKind, string>> = {
  DRAGON_STRAIGHT: 'Sảnh rồng',
  FOUR_TWOS: 'Tứ quý heo',
  FIVE_CONSECUTIVE_PAIRS: 'Năm đôi thông',
  SIX_PAIRS: 'Sáu đôi',
  FOUR_THREES: 'Tứ quý 3',
};
