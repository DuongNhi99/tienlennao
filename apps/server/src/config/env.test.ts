import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    const env = validateEnv(base);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 4000,
      WEB_ORIGIN: ['http://localhost:3000'],
      REDIS_URL: 'redis://localhost:6379',
      LOG_LEVEL: 'info',
    });
  });

  it('coerces PORT and splits WEB_ORIGIN', () => {
    const env = validateEnv({
      ...base,
      PORT: '8080',
      WEB_ORIGIN: 'https://tienlen.example, https://www.tienlen.example',
    });
    expect(env.PORT).toBe(8080);
    expect(env.WEB_ORIGIN).toEqual(['https://tienlen.example', 'https://www.tienlen.example']);
  });

  it('rejects a missing or non-PostgreSQL DATABASE_URL without echoing the value', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
    const secret = 'mysql://root:hunter2@db/app';
    let message = '';
    try {
      validateEnv({ DATABASE_URL: secret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain('hunter2');
  });

  it('rejects invalid origins and ports', () => {
    expect(() => validateEnv({ ...base, WEB_ORIGIN: 'not a url' })).toThrow(/WEB_ORIGIN/);
    expect(() => validateEnv({ ...base, WEB_ORIGIN: 'localhost:3000' })).toThrow(/WEB_ORIGIN/);
    expect(() => validateEnv({ ...base, PORT: '70000' })).toThrow(/PORT/);
  });
});
