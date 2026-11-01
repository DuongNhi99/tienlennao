import { z } from 'zod';
import { CARDS_PER_PLAYER, PLAYERS_PER_MATCH } from '../constants/game';
import { SUITS } from './cards';

/**
 * Configurable parts of the rule specification (docs/GAME_RULES.md). Anything not listed here
 * is fixed by the spec. Presets are stored as JSON in `game_rule_configurations.rules` and
 * copied into `matches.ruleSnapshot`, so this schema is also the persistence contract.
 */

export const GAME_RULES_SPEC_VERSION = 2;

export const OPENING_RULES = ['HOLDER_MUST_PLAY_LOWEST', 'HOLDER_LEADS_FREELY'] as const;
export type OpeningRule = (typeof OPENING_RULES)[number];

export const END_CONDITIONS = ['ALL_PLACEMENTS', 'FIRST_FINISHER'] as const;
export type EndCondition = (typeof END_CONDITIONS)[number];

export const INSTANT_WIN_KINDS = [
  'DRAGON_STRAIGHT',
  'FOUR_TWOS',
  'FIVE_CONSECUTIVE_PAIRS',
  'SIX_PAIRS',
  'FOUR_THREES',
] as const;
export type InstantWinKind = (typeof INSTANT_WIN_KINDS)[number];

const penaltyWeight = z.number().int().min(0).max(100);

export const gameRulesSchema = z.object({
  variant: z.literal('TIEN_LEN_MIEN_NAM'),
  specVersion: z.literal(GAME_RULES_SPEC_VERSION),
  players: z.literal(PLAYERS_PER_MATCH),
  cardsPerPlayer: z.literal(CARDS_PER_PLAYER),
  /** Lowest to highest; must be a permutation of the four suits. */
  suitOrder: z
    .array(z.enum(SUITS))
    .length(SUITS.length)
    .refine((order) => new Set(order).size === SUITS.length, 'Each suit must appear once.'),
  opening: z.enum(OPENING_RULES),
  endCondition: z.enum(END_CONDITIONS),
  /** Special beats ("chặt"). A disabled bomb still plays normally against its own type. */
  bombs: z.object({
    threeConsecutivePairs: z.boolean(),
    fourOfAKind: z.boolean(),
    fourConsecutivePairs: z.boolean(),
  }),
  /** Enabled instant-win kinds, highest priority first. Empty disables instant wins. */
  instantWins: z
    .array(z.enum(INSTANT_WIN_KINDS))
    .refine((kinds) => new Set(kinds).size === kinds.length, 'Instant-win kinds must be unique.'),
  /** Penalty points for cards still held when a match ends by normal play. 0 disables. */
  leftoverPenalties: z.object({
    blackTwo: penaltyWeight,
    redTwo: penaltyWeight,
    fourOfAKind: penaltyWeight,
    threeConsecutivePairs: penaltyWeight,
    fourConsecutivePairs: penaltyWeight,
  }),
});
export type GameRules = z.infer<typeof gameRulesSchema>;

/** The default preset (docs/GAME_RULES.md). Engine functions never mutate rules. */
export const DEFAULT_GAME_RULES: GameRules = {
  variant: 'TIEN_LEN_MIEN_NAM',
  specVersion: GAME_RULES_SPEC_VERSION,
  players: PLAYERS_PER_MATCH,
  cardsPerPlayer: CARDS_PER_PLAYER,
  suitOrder: [...SUITS],
  opening: 'HOLDER_MUST_PLAY_LOWEST',
  endCondition: 'ALL_PLACEMENTS',
  bombs: { threeConsecutivePairs: true, fourOfAKind: true, fourConsecutivePairs: true },
  instantWins: ['DRAGON_STRAIGHT', 'FOUR_TWOS', 'FIVE_CONSECUTIVE_PAIRS', 'SIX_PAIRS'],
  leftoverPenalties: {
    blackTwo: 1,
    redTwo: 2,
    fourOfAKind: 4,
    threeConsecutivePairs: 3,
    fourConsecutivePairs: 6,
  },
};
