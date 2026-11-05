import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_RULES } from '../game/rules';
import {
  createRoomFormSchema,
  createRoomRequestSchema,
  roomCodeSchema,
  seriesSettingsSchema,
  updateRoomSettingsRequestSchema,
} from './rooms';

describe('roomCodeSchema', () => {
  it('normalizes case and whitespace', () => {
    expect(roomCodeSchema.parse(' abc234 ')).toBe('ABC234');
  });

  it('rejects look-alike characters and wrong lengths', () => {
    expect(roomCodeSchema.safeParse('ABCDE0').success).toBe(false);
    expect(roomCodeSchema.safeParse('ABCDEI').success).toBe(false);
    expect(roomCodeSchema.safeParse('ABC23').success).toBe(false);
  });
});

describe('createRoomFormSchema', () => {
  const base = { visibility: 'PUBLIC' as const, entryFee: 100, turnTimerSeconds: 30 };

  it('turns empty optional strings into undefined', () => {
    expect(createRoomFormSchema.parse({ ...base, name: '  ', password: '' })).toEqual({
      ...base,
      name: undefined,
      password: undefined,
      // Older clients send neither: four seats, no spectators.
      maxPlayers: 4,
      allowSpectators: false,
    });
  });

  it('allows a password only for private rooms', () => {
    expect(createRoomFormSchema.safeParse({ ...base, password: 'abcd' }).success).toBe(false);
    expect(
      createRoomFormSchema.safeParse({ ...base, visibility: 'PRIVATE', password: 'abcd' }).success,
    ).toBe(true);
  });

  it('rejects negative or fractional entry fees', () => {
    expect(createRoomFormSchema.safeParse({ ...base, entryFee: -1 }).success).toBe(false);
    expect(createRoomFormSchema.safeParse({ ...base, entryFee: 1.5 }).success).toBe(false);
  });

  it('requires an idempotency key on the wire request', () => {
    expect(createRoomRequestSchema.safeParse(base).success).toBe(false);
    expect(
      createRoomRequestSchema.safeParse({ ...base, requestId: crypto.randomUUID() }).success,
    ).toBe(true);
  });
});

describe('room options (rules, seats, spectators)', () => {
  const base = { visibility: 'PUBLIC' as const, entryFee: 0, turnTimerSeconds: 30 };

  it('accepts 2 to 4 seats only', () => {
    for (const maxPlayers of [2, 3, 4]) {
      expect(createRoomFormSchema.safeParse({ ...base, maxPlayers }).success).toBe(true);
    }
    for (const maxPlayers of [1, 5, 2.5]) {
      expect(createRoomFormSchema.safeParse({ ...base, maxPlayers }).success).toBe(false);
    }
  });

  it('validates custom rules with the rules schema (and upgrades older versions)', () => {
    const rules = { ...DEFAULT_GAME_RULES, opening: 'HOLDER_LEADS_FREELY' };
    expect(createRoomFormSchema.parse({ ...base, rules }).rules).toEqual(rules);
    expect(
      createRoomFormSchema.safeParse({ ...base, rules: { ...rules, opening: 'X' } }).success,
    ).toBe(false);
  });

  it('keeps omitted settings unchanged on update', () => {
    expect(updateRoomSettingsRequestSchema.parse({ entryFee: 0, turnTimerSeconds: 30 })).toEqual({
      entryFee: 0,
      turnTimerSeconds: 30,
    });
  });
});

describe('seriesSettingsSchema', () => {
  it('needs the target that matches the end condition, and drops the other one', () => {
    expect(
      seriesSettingsSchema.parse({ endCondition: 'ROUNDS', targetRounds: 5, targetScore: 9 }),
    ).toEqual({
      endCondition: 'ROUNDS',
      targetRounds: 5,
      targetScore: null,
    });
    expect(seriesSettingsSchema.safeParse({ endCondition: 'ROUNDS' }).success).toBe(false);
    expect(
      seriesSettingsSchema.safeParse({ endCondition: 'TARGET_SCORE', targetScore: 0 }).success,
    ).toBe(false);
    expect(seriesSettingsSchema.parse({ endCondition: 'MANUAL', targetRounds: null })).toEqual({
      endCondition: 'MANUAL',
      targetRounds: null,
      targetScore: null,
    });
  });
});
