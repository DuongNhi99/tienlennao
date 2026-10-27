import { describe, expect, it } from 'vitest';
import { describeError } from './describe-error';

describe('describeError', () => {
  it('returns only the first line of the message', () => {
    expect(describeError(new Error('first line\nsecond line with details'))).toBe('first line');
  });

  it('falls back to name and code when the message is empty', () => {
    const error = Object.assign(new AggregateError([], ''), { code: 'ECONNREFUSED' });
    expect(describeError(error)).toBe('AggregateError (ECONNREFUSED)');
  });

  it('handles non-Error values', () => {
    expect(describeError('boom')).toBe('unknown error');
  });
});
