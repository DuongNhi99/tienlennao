import { describe, expect, it } from 'vitest';
import { publicEnvSchema } from '@/lib/env';

describe('publicEnvSchema', () => {
  it('defaults the API URL for local development', () => {
    expect(publicEnvSchema.parse({}).NEXT_PUBLIC_API_URL).toBe('http://localhost:4000/api/v1');
  });

  it('strips trailing slashes', () => {
    expect(
      publicEnvSchema.parse({ NEXT_PUBLIC_API_URL: 'https://api.tienlen.example/api/v1/' })
        .NEXT_PUBLIC_API_URL,
    ).toBe('https://api.tienlen.example/api/v1');
  });

  it('rejects malformed URLs', () => {
    expect(() => publicEnvSchema.parse({ NEXT_PUBLIC_API_URL: 'localhost:4000' })).toThrow();
  });
});
