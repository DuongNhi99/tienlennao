import { describe, expect, it } from 'vitest';
import { DEFAULT_AFTER_LOGIN, safeRedirectPath } from '@/lib/safe-redirect';

describe('safeRedirectPath', () => {
  it('keeps same-origin paths, including query and hash', () => {
    expect(safeRedirectPath('/room/abc?tab=chat#seat')).toBe('/room/abc?tab=chat#seat');
    expect(safeRedirectPath('/wallet')).toBe('/wallet');
  });

  it.each([
    undefined,
    null,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    '/lobby\u0000',
    '/%0d%0aSet-Cookie:x',
    'lobby',
  ])('falls back to the lobby for unsafe target %s', (target) => {
    const result = safeRedirectPath(target);
    expect(result.startsWith('/')).toBe(true);
    expect(result.startsWith('//')).toBe(false);
    if (target !== '/%0d%0aSet-Cookie:x') expect(result).toBe(DEFAULT_AFTER_LOGIN);
  });

  it('never redirects back into the auth pages', () => {
    expect(safeRedirectPath('/login')).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeRedirectPath('/register?x=1')).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeRedirectPath('/reset-password/abc')).toBe(DEFAULT_AFTER_LOGIN);
  });
});
