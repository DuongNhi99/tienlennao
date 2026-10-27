import { describe, expect, it } from 'vitest';
import { ERROR_CODES, ERROR_MESSAGES_VI, apiErrorSchema } from './errors';

describe('error contract', () => {
  it('has a non-empty Vietnamese message for every error code', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_MESSAGES_VI[code]).toBeTruthy();
    }
    expect(Object.keys(ERROR_MESSAGES_VI).sort()).toEqual([...ERROR_CODES].sort());
  });

  it('includes every error code required by the product specification', () => {
    const required = [
      'INVALID_CREDENTIALS',
      'EMAIL_ALREADY_EXISTS',
      'SESSION_EXPIRED',
      'ACCOUNT_SUSPENDED',
      'ROOM_NOT_FOUND',
      'ROOM_FULL',
      'ROOM_ALREADY_STARTED',
      'INSUFFICIENT_COINS',
      'NOT_YOUR_TURN',
      'INVALID_CARD_SELECTION',
      'INVALID_COMBINATION',
      'ACTION_ALREADY_PROCESSED',
      'MATCH_FINISHED',
      'CONNECTION_LOST',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
    ];
    expect(ERROR_CODES).toEqual(expect.arrayContaining(required));
  });

  it('rejects unknown error codes in the envelope', () => {
    expect(apiErrorSchema.safeParse({ error: { code: 'NOPE', message: 'x' } }).success).toBe(false);
    expect(
      apiErrorSchema.safeParse({ error: { code: 'ROOM_FULL', message: 'Phòng đã đủ người.' } })
        .success,
    ).toBe(true);
  });
});
