import { z } from 'zod';
import { CARDS_PER_PLAYER, PLAYERS_PER_MATCH } from '../constants/game';
import { SUITS } from './cards';

/**
 * Configurable parts of the rule specification (docs/GAME_RULES.md). Anything not listed here
 * is fixed by the spec. Presets are stored as JSON in `game_rule_configurations.rules` and
 * copied into `matches.ruleSnapshot`, so this schema is also the persistence contract.
 */

export const GAME_RULES_SPEC_VERSION = 3;

export const OPENING_RULES = ['HOLDER_MUST_PLAY_LOWEST', 'HOLDER_LEADS_FREELY'] as const;
export type OpeningRule = (typeof OPENING_RULES)[number];

/** Who takes the first turn (docs/GAME_RULES.md §7). */
export const STARTER_RULES = ['LOWEST_CARD', 'PREVIOUS_WINNER'] as const;
export type StarterRule = (typeof STARTER_RULES)[number];

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

const rulesV3Schema = z.object({
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
  starter: z.enum(STARTER_RULES),
  endCondition: z.enum(END_CONDITIONS),
  /** Special beats ("chặt"). A disabled bomb still plays normally against its own type. */
  bombs: z.object({
    threeConsecutivePairs: z.boolean(),
    fourOfAKind: z.boolean(),
    fourConsecutivePairs: z.boolean(),
    /** Three consecutive pairs also chop a pair of 2s (needs `threeConsecutivePairs`). */
    threeConsecutivePairsBeatPairOfTwos: z.boolean(),
    /** Bombs chop other bombs: four of a kind over three pairs, longer runs over the rest. */
    bombsBeatBombs: z.boolean(),
    /** Chops may be played out of turn, even after passing (chặt ngang). */
    outOfTurn: z.boolean(),
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Spec v2 presets and match snapshots predate the v3 settings. v2 behaved exactly like the v3
 * values filled in here, so an upgraded match plays on unchanged.
 */
function upgradeRules(value: unknown): unknown {
  if (!isRecord(value) || value.specVersion !== 2) return value;
  return {
    ...value,
    specVersion: GAME_RULES_SPEC_VERSION,
    starter: 'LOWEST_CARD',
    bombs: {
      threeConsecutivePairsBeatPairOfTwos: false,
      bombsBeatBombs: true,
      outOfTurn: false,
      ...(isRecord(value.bombs) ? value.bombs : {}),
    },
  };
}

/** Parses spec v3 rules, upgrading v2 (stored presets, running matches) on the way. */
export const gameRulesSchema = z.preprocess(upgradeRules, rulesV3Schema);
export type GameRules = z.infer<typeof rulesV3Schema>;

/** The default preset (docs/GAME_RULES.md). Engine functions never mutate rules. */
export const DEFAULT_GAME_RULES: GameRules = {
  variant: 'TIEN_LEN_MIEN_NAM',
  specVersion: GAME_RULES_SPEC_VERSION,
  players: PLAYERS_PER_MATCH,
  cardsPerPlayer: CARDS_PER_PLAYER,
  suitOrder: [...SUITS],
  opening: 'HOLDER_MUST_PLAY_LOWEST',
  starter: 'LOWEST_CARD',
  endCondition: 'ALL_PLACEMENTS',
  bombs: {
    threeConsecutivePairs: true,
    fourOfAKind: true,
    fourConsecutivePairs: true,
    threeConsecutivePairsBeatPairOfTwos: false,
    bombsBeatBombs: true,
    outOfTurn: false,
  },
  instantWins: ['DRAGON_STRAIGHT', 'FOUR_TWOS', 'FIVE_CONSECUTIVE_PAIRS', 'SIX_PAIRS'],
  leftoverPenalties: {
    blackTwo: 1,
    redTwo: 2,
    fourOfAKind: 4,
    threeConsecutivePairs: 3,
    fourConsecutivePairs: 6,
  },
};

export const RULE_VARIANT_KEYS = [
  'STANDARD',
  'CHOP_OUT_OF_TURN',
  'WINNER_LEADS',
  'FIRST_FINISHER',
] as const;
export type RuleVariantKey = (typeof RULE_VARIANT_KEYS)[number];

/**
 * Named regional variants (docs/GAME_RULES.md §16), used as starting points for admin presets.
 * Each differs from the standard rules only where its name says.
 */
export const RULE_VARIANTS: Readonly<Record<RuleVariantKey, { label: string; rules: GameRules }>> =
  {
    STANDARD: { label: 'Miền Nam chuẩn', rules: DEFAULT_GAME_RULES },
    CHOP_OUT_OF_TURN: {
      label: 'Chặt ngang (chặt không cần tới lượt)',
      rules: { ...DEFAULT_GAME_RULES, bombs: { ...DEFAULT_GAME_RULES.bombs, outOfTurn: true } },
    },
    WINNER_LEADS: {
      label: 'Người thắng ván trước đánh trước',
      rules: { ...DEFAULT_GAME_RULES, starter: 'PREVIOUS_WINNER' },
    },
    FIRST_FINISHER: {
      label: 'Nhất ăn tất (kết thúc khi có người về nhất)',
      rules: { ...DEFAULT_GAME_RULES, endCondition: 'FIRST_FINISHER' },
    },
  };
