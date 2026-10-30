import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Integration tests: the real HTTP app against a real PostgreSQL test database (see
 * test/integration/global-setup.ts). Redis is used when reachable; otherwise rate limiting
 * falls back to in-memory counters, which the tests also cover.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    setupFiles: ['test/integration/setup-env.ts'],
    // One shared database: run files one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      WEB_ORIGIN: 'http://localhost:3000',
      // Each test sends its own X-Forwarded-For, so per-IP limits never collide between tests.
      TRUST_PROXY: '1',
      INITIAL_COIN_BONUS: '10000',
    },
  },
});
