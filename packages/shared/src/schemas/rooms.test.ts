import { describe, expect, it } from 'vitest';
import { createRoomFormSchema, createRoomRequestSchema, roomCodeSchema } from './rooms';

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
