import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppException } from '../errors/app.exception';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(
    z.object({ email: z.email().transform((e) => e.toLowerCase()), age: z.number().int() }),
  );

  it('returns the parsed, normalized value', () => {
    expect(pipe.transform({ email: 'Player@Example.COM', age: 20 })).toEqual({
      email: 'player@example.com',
      age: 20,
    });
  });

  it('throws VALIDATION_ERROR with per-field details', () => {
    try {
      pipe.transform({ email: 'nope', age: 1.5 });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      const appError = error as AppException;
      expect(appError.code).toBe('VALIDATION_ERROR');
      expect(appError.getStatus()).toBe(400);
      expect(appError.details?.map((d) => d.path).sort()).toEqual(['age', 'email']);
    }
  });
});
