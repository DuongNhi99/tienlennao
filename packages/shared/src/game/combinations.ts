import { type CardId, cardStrength, parseCard, RANKS, sortCards } from './cards';
import type { GameRules } from './rules';

/** Combination types from docs/GAME_RULES.md §3. */
export const COMBINATION_TYPES = [
  'SINGLE',
  'PAIR',
  'TRIPLE',
  'FOUR_OF_A_KIND',
  'STRAIGHT',
  'CONSECUTIVE_PAIRS',
] as const;
export type CombinationType = (typeof COMBINATION_TYPES)[number];

export interface Combination {
  type: CombinationType;
  /** Weakest first. */
  cards: CardId[];
  /** The strongest card; decides comparisons between combinations of the same shape. */
  top: CardId;
}

const TWO = RANKS.indexOf('2');
const MIN_STRAIGHT = 3;
const MIN_CONSECUTIVE_PAIRS = 3;

export const rankIndex = (card: CardId): number => RANKS.indexOf(parseCard(card).rank);
export const isTwo = (card: CardId): boolean => rankIndex(card) === TWO;

type SuitOrderRules = Pick<GameRules, 'suitOrder'>;

/**
 * Classifies a set of cards, or returns null if they do not form a valid combination
 * (including empty and duplicate selections). Does not check ownership or the table.
 */
export function classifyCombination(
  cards: readonly CardId[],
  rules: SuitOrderRules,
): Combination | null {
  if (cards.length === 0 || new Set(cards).size !== cards.length) return null;
  const sorted = sortCards(cards, 'rank', rules.suitOrder);
  const ranks = sorted.map(rankIndex);
  const make = (type: CombinationType): Combination => ({
    type,
    cards: sorted,
    top: sorted.at(-1)!,
  });

  if (ranks.every((rank) => rank === ranks[0])) {
    const sameRank = ['SINGLE', 'PAIR', 'TRIPLE', 'FOUR_OF_A_KIND'] as const;
    return make(sameRank[sorted.length - 1]!);
  }
  // Runs never contain a 2, and ranks never wrap (no A-2-3).
  if (ranks.at(-1) === TWO) return null;
  if (sorted.length >= MIN_STRAIGHT && ranks.every((rank, i) => rank === ranks[0]! + i)) {
    return make('STRAIGHT');
  }
  if (
    sorted.length >= MIN_CONSECUTIVE_PAIRS * 2 &&
    sorted.length % 2 === 0 &&
    ranks.every((rank, i) => rank === ranks[0]! + Math.floor(i / 2))
  ) {
    return make('CONSECUTIVE_PAIRS');
  }
  return null;
}

export type SelectionViolation = 'EMPTY_SELECTION' | 'DUPLICATE_CARDS' | 'INVALID_COMBINATION';

export type CombinationCheck =
  { ok: true; combination: Combination } | { ok: false; violation: SelectionViolation };

/** Like `classifyCombination`, but says why a selection is rejected. */
export function validateCombination(
  cards: readonly CardId[],
  rules: SuitOrderRules,
): CombinationCheck {
  if (cards.length === 0) return { ok: false, violation: 'EMPTY_SELECTION' };
  if (new Set(cards).size !== cards.length) return { ok: false, violation: 'DUPLICATE_CARDS' };
  const combination = classifyCombination(cards, rules);
  return combination ? { ok: true, combination } : { ok: false, violation: 'INVALID_COMBINATION' };
}

const pairCount = (c: Combination) => c.cards.length / 2;

/** Same type and size: the only case where the normal (non-bomb) comparison applies. */
export function isSameShape(a: Combination, b: Combination): boolean {
  return a.type === b.type && a.cards.length === b.cards.length;
}

/** Bomb powers from docs/GAME_RULES.md §5. */
function bombBeats(play: Combination, target: Combination, rules: GameRules): boolean {
  const singleTwo = target.type === 'SINGLE' && isTwo(target.top);
  const pairOfTwos = target.type === 'PAIR' && isTwo(target.top);
  const { bombs } = rules;

  if (play.type === 'FOUR_OF_A_KIND') {
    return (
      bombs.fourOfAKind &&
      (singleTwo ||
        pairOfTwos ||
        (target.type === 'CONSECUTIVE_PAIRS' && pairCount(target) === MIN_CONSECUTIVE_PAIRS))
    );
  }
  if (play.type !== 'CONSECUTIVE_PAIRS') return false;

  // Longer runs keep the three-pair power even when the four-pair power is disabled.
  if (singleTwo && bombs.threeConsecutivePairs) return true;
  if (pairCount(play) === MIN_CONSECUTIVE_PAIRS || !bombs.fourConsecutivePairs) return false;
  return (
    singleTwo ||
    pairOfTwos ||
    target.type === 'FOUR_OF_A_KIND' ||
    (target.type === 'CONSECUTIVE_PAIRS' && pairCount(target) < pairCount(play))
  );
}

/** True when `play` may be played on top of `target` (docs/GAME_RULES.md §4–5). */
export function canBeatCombination(
  play: Combination,
  target: Combination,
  rules: GameRules,
): boolean {
  if (isSameShape(play, target)) {
    return cardStrength(play.top, rules.suitOrder) > cardStrength(target.top, rules.suitOrder);
  }
  return bombBeats(play, target, rules);
}

function subsets<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  const result: T[][] = [];
  items.forEach((item, i) => {
    for (const rest of subsets(items.slice(i + 1), size - 1)) result.push([item, ...rest]);
  });
  return result;
}

function product<T>(groups: readonly (readonly T[][])[]): T[][] {
  return groups.reduce<T[][]>(
    (acc, group) => acc.flatMap((prefix) => group.map((choice) => [...prefix, ...choice])),
    [[]],
  );
}

/** The hand's cards grouped by rank index (0 = 3 … 12 = 2). */
export function groupByRank(hand: readonly CardId[]): CardId[][] {
  const byRank: CardId[][] = RANKS.map(() => []);
  for (const card of new Set(hand)) byRank[rankIndex(card)]!.push(card);
  return byRank;
}

/** Every valid combination that can be formed from `hand`. Used for bots, hints and tests. */
export function listCombinations(hand: readonly CardId[], rules: GameRules): Combination[] {
  const byRank = groupByRank(hand);
  const groups: CardId[][] = [];
  for (const cards of byRank) {
    for (let size = 1; size <= cards.length; size++) groups.push(...subsets(cards, size));
  }
  // Runs: every start rank and length, choosing one card (straight) or two (pairs) per rank.
  for (const [perRank, minLength] of [
    [1, MIN_STRAIGHT],
    [2, MIN_CONSECUTIVE_PAIRS],
  ] as const) {
    for (let start = 0; start < TWO; start++) {
      for (let end = start; end < TWO && byRank[end]!.length >= perRank; end++) {
        if (end - start + 1 < minLength) continue;
        const choices = byRank.slice(start, end + 1).map((cards) => subsets(cards, perRank));
        groups.push(...product(choices));
      }
    }
  }
  return groups.map((cards) => classifyCombination(cards, rules)!);
}

export const COMBINATION_LABELS_VI: Readonly<Record<CombinationType, string>> = {
  SINGLE: 'Bài lẻ',
  PAIR: 'Đôi',
  TRIPLE: 'Sám cô',
  FOUR_OF_A_KIND: 'Tứ quý',
  STRAIGHT: 'Sảnh',
  CONSECUTIVE_PAIRS: 'Đôi thông',
};

/** Short Vietnamese description, e.g. "Sảnh 5 lá", "3 đôi thông", "Đôi". */
export function describeCombination(combination: Combination): string {
  if (combination.type === 'STRAIGHT') return `Sảnh ${combination.cards.length} lá`;
  if (combination.type === 'CONSECUTIVE_PAIRS') return `${pairCount(combination)} đôi thông`;
  return COMBINATION_LABELS_VI[combination.type];
}
