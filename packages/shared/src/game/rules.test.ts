import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_RULES, gameRulesSchema } from './rules';

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
  });
});
