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

  it('applies account defaults and validates mail and proxy settings', () => {
    expect(validateEnv(base)).toMatchObject({
      SESSION_TTL_DAYS: 30,
      INITIAL_COIN_BONUS: 10_000,
      TRUST_PROXY: 0,
      MAIL_OUTBOX_DIR: '.local/mail',
      UPLOAD_DIR: '.local/uploads',
    });
    expect(validateEnv({ ...base, WEB_APP_URL: 'https://tienlen.example/' }).WEB_APP_URL).toBe(
      'https://tienlen.example',
    );
    expect(() => validateEnv({ ...base, SMTP_URL: 'http://mail' })).toThrow(/SMTP_URL/);
    expect(() => validateEnv({ ...base, TRUST_PROXY: '-1' })).toThrow(/TRUST_PROXY/);
    expect(() => validateEnv({ ...base, SESSION_TTL_DAYS: '0' })).toThrow(/SESSION_TTL_DAYS/);
  });

  it('rejects invalid origins and ports', () => {
    expect(() => validateEnv({ ...base, WEB_ORIGIN: 'not a url' })).toThrow(/WEB_ORIGIN/);
    expect(() => validateEnv({ ...base, WEB_ORIGIN: 'localhost:3000' })).toThrow(/WEB_ORIGIN/);
    expect(() => validateEnv({ ...base, PORT: '70000' })).toThrow(/PORT/);
  });
});
