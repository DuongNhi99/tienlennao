import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GAME_RULES,
  type GameRules,
  gameRulesSchema,
  placementPoints,
  roundScore,
  RULE_VARIANT_KEYS,
  RULE_VARIANTS,
  ruleVariantOf,
} from './rules';

/** The default preset as spec v3 stored it, before the v4 settings existed. */
const { scoring: _scoring, ...v3Base } = DEFAULT_GAME_RULES;
const {
  perCard: _perCard,
  unplayedHand: _unplayed,
  ...v3Penalties
} = DEFAULT_GAME_RULES.leftoverPenalties;
const V3_RULES = { ...v3Base, specVersion: 3, leftoverPenalties: v3Penalties };

/** …and as spec v2 stored it, before the v3 settings existed. */
const { starter: _, ...v2Base } = V3_RULES;
const V2_RULES = {
  ...v2Base,
  specVersion: 2,
  bombs: { threeConsecutivePairs: true, fourOfAKind: true, fourConsecutivePairs: true },
};

describe('gameRulesSchema', () => {
  it('accepts the default preset', () => {
    expect(gameRulesSchema.parse(DEFAULT_GAME_RULES)).toEqual(DEFAULT_GAME_RULES);
  });

  it('requires the suit order to be a permutation of the four suits', () => {
    expect(
      gameRulesSchema.safeParse({ ...DEFAULT_GAME_RULES, suitOrder: ['H', 'D', 'C', 'S'] }).success,
    ).toBe(true);
    expect(
      gameRulesSchema.safeParse({ ...DEFAULT_GAME_RULES, suitOrder: ['S', 'S', 'D', 'H'] }).success,
    ).toBe(false);
    expect(
      gameRulesSchema.safeParse({ ...DEFAULT_GAME_RULES, suitOrder: ['S', 'C', 'D'] }).success,
    ).toBe(false);
  });

  it('rejects duplicate instant-win kinds and negative or fractional penalties', () => {
    const instantWins = ['SIX_PAIRS', 'SIX_PAIRS'];
    expect(gameRulesSchema.safeParse({ ...DEFAULT_GAME_RULES, instantWins }).success).toBe(false);
    for (const redTwo of [-1, 1.5]) {
      const leftoverPenalties = { ...DEFAULT_GAME_RULES.leftoverPenalties, redTwo };
      expect(gameRulesSchema.safeParse({ ...DEFAULT_GAME_RULES, leftoverPenalties }).success).toBe(
        false,
      );
    }
  });

  it('rejects other spec versions, player counts and unknown options', () => {
    expect(gameRulesSchema.safeParse({ ...DEFAULT_GAME_RULES, specVersion: 1 }).success).toBe(
      false,
    );
    expect(gameRulesSchema.safeParse({ ...DEFAULT_GAME_RULES, players: 3 }).success).toBe(false);
    expect(gameRulesSchema.safeParse({ ...DEFAULT_GAME_RULES, opening: 'ANY' }).success).toBe(
      false,
    );
    expect(gameRulesSchema.safeParse({ ...DEFAULT_GAME_RULES, starter: 'DEALER' }).success).toBe(
      false,
    );
  });

  it('upgrades spec v3 rules to v4 with the behaviour v3 had', () => {
    expect(gameRulesSchema.parse(V3_RULES)).toEqual(DEFAULT_GAME_RULES);
    const heavier = { ...V3_RULES, leftoverPenalties: { ...v3Penalties, redTwo: 5 } };
    expect(gameRulesSchema.parse(heavier).leftoverPenalties).toMatchObject({
      redTwo: 5,
      perCard: 0,
      unplayedHand: 0,
    });
  });

  it('requires place points that never rise for a worse place', () => {
    const scoring = (four: number[]) => ({
      ...DEFAULT_GAME_RULES,
      scoring: {
        ...DEFAULT_GAME_RULES.scoring,
        placementPoints: { ...DEFAULT_GAME_RULES.scoring.placementPoints, four },
      },
    });
    expect(gameRulesSchema.safeParse(scoring([5, 3, 3, -1])).success).toBe(true);
    expect(gameRulesSchema.safeParse(scoring([3, 2, 4, 0])).success).toBe(false);
    expect(gameRulesSchema.safeParse(scoring([3, 2, 1])).success).toBe(false);
  });

  it('upgrades spec v2 rules to v3 with the behaviour v2 had', () => {
    expect(gameRulesSchema.parse(V2_RULES)).toEqual(DEFAULT_GAME_RULES);
    // Settings v2 already had are kept.
    const noQuads = { ...V2_RULES, bombs: { ...V2_RULES.bombs, fourOfAKind: false } };
    expect(gameRulesSchema.parse(noQuads).bombs).toMatchObject({
      fourOfAKind: false,
      outOfTurn: false,
    });
  });

  it('requires every v3 setting once the version says 3', () => {
    const { outOfTurn: _, ...bombs } = DEFAULT_GAME_RULES.bombs;
    expect(gameRulesSchema.safeParse({ ...DEFAULT_GAME_RULES, bombs }).success).toBe(false);
  });
});

describe('RULE_VARIANTS', () => {
  it('are valid presets that each differ from the standard rules', () => {
    for (const key of RULE_VARIANT_KEYS) {
      const { rules } = RULE_VARIANTS[key];
      expect(gameRulesSchema.parse(rules)).toEqual(rules);
      if (key !== 'STANDARD') expect(rules).not.toEqual(DEFAULT_GAME_RULES);
    }
    expect(RULE_VARIANTS.STANDARD.rules).toBe(DEFAULT_GAME_RULES);
  });

  it('are told apart by content, and anything edited is custom', () => {
    for (const key of RULE_VARIANT_KEYS) {
      // A JSON round trip (as stored in the database) keeps the identity.
      const stored = JSON.parse(JSON.stringify(RULE_VARIANTS[key].rules)) as GameRules;
      expect(ruleVariantOf(stored)).toBe(key);
    }
    expect(ruleVariantOf({ ...DEFAULT_GAME_RULES, suitOrder: ['H', 'D', 'C', 'S'] })).toBe(
      'CUSTOM',
    );
  });
});

describe('round scoring', () => {
  it('uses the place points for the player count', () => {
    expect([1, 2, 3, 4].map((p) => placementPoints(DEFAULT_GAME_RULES, 4, p))).toEqual([
      3, 2, 1, 0,
    ]);
    expect([1, 2, 3].map((p) => placementPoints(DEFAULT_GAME_RULES, 3, p))).toEqual([2, 1, 0]);
    expect([1, 2].map((p) => placementPoints(DEFAULT_GAME_RULES, 2, p))).toEqual([1, 0]);
  });

  it('subtracts penalty points only when configured', () => {
    expect(roundScore(DEFAULT_GAME_RULES, 4, 4, 3)).toBe(-3);
    expect(roundScore(RULE_VARIANTS.CASUAL.rules, 4, 4, 3)).toBe(0);
    expect(roundScore(DEFAULT_GAME_RULES, 4, 1, 0)).toBe(3);
  });
});
