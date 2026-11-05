import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_RULES, gameRulesSchema, RULE_VARIANT_KEYS, RULE_VARIANTS } from './rules';

/** The default preset as spec v2 stored it, before the v3 settings existed. */
const { starter: _, ...v2Base } = DEFAULT_GAME_RULES;
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
});
