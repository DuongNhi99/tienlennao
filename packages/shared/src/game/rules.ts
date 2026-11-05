import { z } from 'zod';
import { CARDS_PER_PLAYER, PLAYERS_PER_MATCH } from '../constants/game';
import { SUITS } from './cards';

/**
 * Configurable parts of the rule specification (docs/GAME_RULES.md). Anything not listed here
 * is fixed by the spec. Presets are stored as JSON in `game_rule_configurations.rules`, rooms may
 * carry their own (`rooms.ruleSnapshot`), and a match copies its rules into
 * `matches.ruleSnapshot`, so this schema is also the persistence contract.
 */

export const GAME_RULES_SPEC_VERSION = 4;

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

export const PENALTY_WEIGHT_MAX = 100;
export const PLACE_POINTS_LIMIT = 100;

const penaltyWeight = z.number().int().min(0).max(PENALTY_WEIGHT_MAX);
const placePoints = z.number().int().min(-PLACE_POINTS_LIMIT).max(PLACE_POINTS_LIMIT);

/** Round points by place (index 0 = 1st); a worse place never scores more than a better one. */
const placementPointsFor = (players: number) =>
  z
    .array(placePoints)
    .length(players)
    .refine(
      (points) => points.every((value, i) => i === 0 || value <= points[i - 1]!),
      'Hạng sau không được nhiều điểm hơn hạng trước.',
    );

const rulesSchemaV4 = z.object({
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
  /** Penalty points for cards still held when a round ends by normal play. 0 disables. */
  leftoverPenalties: z.object({
    blackTwo: penaltyWeight,
    redTwo: penaltyWeight,
    fourOfAKind: penaltyWeight,
    threeConsecutivePairs: penaltyWeight,
    fourConsecutivePairs: penaltyWeight,
    /** (v4) Points for every card still held. Not charged on an unplayed hand (cóng). */
    perCard: penaltyWeight,
    /** (v4) Cóng: flat points for a player who never played a card; replaces `perCard`. */
    unplayedHand: penaltyWeight,
  }),
  /** (v4) Round score = points for the place, minus penalty points if `subtractPenalties`. */
  scoring: z.object({
    placementPoints: z.object({
      two: placementPointsFor(2),
      three: placementPointsFor(3),
      four: placementPointsFor(4),
    }),
    subtractPenalties: z.boolean(),
  }),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Round scoring of the standard rules; also what v3 rules are upgraded with. */
export const DEFAULT_SCORING = {
  placementPoints: { two: [1, 0], three: [2, 1, 0], four: [3, 2, 1, 0] },
  subtractPenalties: true,
};

/**
 * Older presets and match snapshots predate later settings. Each step fills them in with values
 * that reproduce how that version played, so an upgraded match plays on unchanged:
 * v2 → v3 (starter, bomb switches); v3 → v4 (per-card and cóng penalties off, and the standard
 * scoring, which only scores rounds and never changes play, placements or coins).
 */
function upgradeRules(value: unknown): unknown {
  if (!isRecord(value)) return value;
  let rules = value;
  if (rules.specVersion === 2) {
    rules = {
      ...rules,
      specVersion: 3,
      starter: 'LOWEST_CARD',
      bombs: {
        threeConsecutivePairsBeatPairOfTwos: false,
        bombsBeatBombs: true,
        outOfTurn: false,
        ...(isRecord(rules.bombs) ? rules.bombs : {}),
      },
    };
  }
  if (rules.specVersion === 3) {
    rules = {
      ...rules,
      specVersion: 4,
      leftoverPenalties: {
        perCard: 0,
        unplayedHand: 0,
        ...(isRecord(rules.leftoverPenalties) ? rules.leftoverPenalties : {}),
      },
      scoring: DEFAULT_SCORING,
    };
  }
  return rules;
}

/** Parses spec v4 rules, upgrading v2 and v3 (stored presets, running matches) on the way. */
export const gameRulesSchema = z.preprocess(upgradeRules, rulesSchemaV4);
export type GameRules = z.infer<typeof rulesSchemaV4>;

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
    perCard: 0,
    unplayedHand: 0,
  },
  scoring: DEFAULT_SCORING,
};

/** Round points for a place (1-based) among `players` (2–4) under `rules.scoring`. */
export function placementPoints(rules: GameRules, players: number, placement: number): number {
  const table = rules.scoring.placementPoints;
  const points = players === 2 ? table.two : players === 3 ? table.three : table.four;
  return points[placement - 1] ?? 0;
}

/** A round's score (docs/GAME_RULES.md §11a): place points, minus penalties if configured. */
export function roundScore(
  rules: GameRules,
  players: number,
  placement: number,
  penaltyPoints: number,
): number {
  const points = placementPoints(rules, players, placement);
  return rules.scoring.subtractPenalties ? points - penaltyPoints : points;
}

export const RULE_VARIANT_KEYS = [
  'STANDARD',
  'COMPETITIVE',
  'CASUAL',
  'CHOP_OUT_OF_TURN',
  'WINNER_LEADS',
  'FIRST_FINISHER',
] as const;
export type RuleVariantKey = (typeof RULE_VARIANT_KEYS)[number];

export interface RuleVariant {
  label: string;
  /** What these rules are, in one sentence (Vietnamese, shown in the rule picker). */
  description: string;
  /** Presets are complete rule sets; regional variants change one rule of the standard. */
  kind: 'PRESET' | 'REGIONAL';
  rules: GameRules;
}

const NO_PENALTIES: GameRules['leftoverPenalties'] = {
  blackTwo: 0,
  redTwo: 0,
  fourOfAKind: 0,
  threeConsecutivePairs: 0,
  fourConsecutivePairs: 0,
  perCard: 0,
  unplayedHand: 0,
};

/**
 * Named rule sets (docs/GAME_RULES.md §16): three presets (standard, competitive, casual) and
 * regional variants that differ from the standard rules only where their name says. Rooms and
 * admin presets start from one of them; any edit makes the rules custom (`ruleVariantOf`).
 */
export const RULE_VARIANTS: Readonly<Record<RuleVariantKey, RuleVariant>> = {
  STANDARD: {
    label: 'Miền Nam chuẩn',
    description: 'Lá nhỏ nhất (3♠) đánh trước, bỏ lượt là mất vòng, phạt thúi heo và thối bom.',
    kind: 'PRESET',
    rules: DEFAULT_GAME_RULES,
  },
  COMPETITIVE: {
    label: 'Thi đấu nghiêm ngặt',
    description:
      'Như luật chuẩn, phạt thêm 1 điểm mỗi lá còn lại và 20 điểm khi bị cóng (chưa đánh lá nào).',
    kind: 'PRESET',
    rules: {
      ...DEFAULT_GAME_RULES,
      leftoverPenalties: { ...DEFAULT_GAME_RULES.leftoverPenalties, perCard: 1, unplayedHand: 20 },
    },
  },
  CASUAL: {
    label: 'Vui vẻ',
    description:
      'Người có lá nhỏ nhất đánh gì cũng được, 3 đôi thông chặt được đôi heo, chỉ tới trắng bằng sảnh rồng hoặc tứ quý heo, không phạt.',
    kind: 'PRESET',
    rules: {
      ...DEFAULT_GAME_RULES,
      opening: 'HOLDER_LEADS_FREELY',
      bombs: { ...DEFAULT_GAME_RULES.bombs, threeConsecutivePairsBeatPairOfTwos: true },
      instantWins: ['DRAGON_STRAIGHT', 'FOUR_TWOS'],
      leftoverPenalties: NO_PENALTIES,
      scoring: { ...DEFAULT_SCORING, subtractPenalties: false },
    },
  },
  CHOP_OUT_OF_TURN: {
    label: 'Chặt ngang (chặt không cần tới lượt)',
    description: 'Như luật chuẩn, nhưng được chặt bất cứ lúc nào, kể cả khi đã bỏ lượt.',
    kind: 'REGIONAL',
    rules: { ...DEFAULT_GAME_RULES, bombs: { ...DEFAULT_GAME_RULES.bombs, outOfTurn: true } },
  },
  WINNER_LEADS: {
    label: 'Người thắng ván trước đánh trước',
    description: 'Như luật chuẩn, nhưng người về nhất ván trước đánh trước ở ván sau.',
    kind: 'REGIONAL',
    rules: { ...DEFAULT_GAME_RULES, starter: 'PREVIOUS_WINNER' },
  },
  FIRST_FINISHER: {
    label: 'Nhất ăn tất (kết thúc khi có người về nhất)',
    description: 'Như luật chuẩn, nhưng ván kết thúc ngay khi có người hết bài.',
    kind: 'REGIONAL',
    rules: { ...DEFAULT_GAME_RULES, endCondition: 'FIRST_FINISHER' },
  },
};

/** JSON with sorted keys, so two rule sets compare by content rather than key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The named rule set these rules equal, or 'CUSTOM' once anything was edited. */
export function ruleVariantOf(rules: GameRules): RuleVariantKey | 'CUSTOM' {
  const key = canonical(rules);
  return RULE_VARIANT_KEYS.find((k) => canonical(RULE_VARIANTS[k].rules) === key) ?? 'CUSTOM';
}
