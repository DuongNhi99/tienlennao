import { defineConfig, devices } from '@playwright/test';
import {
  API_PORT,
  API_URL,
  e2eDatabaseUrl,
  MAIL_DIR,
  UPLOAD_DIR,
  WEB_PORT,
  WEB_URL,
} from './e2e-auth/env';

/**
 * Authentication against the real stack: the API (built to dist-e2e, so it never clashes with
 * a running `pnpm dev`) on a throwaway PostgreSQL database, and a production build of the web
 * app without preview mode. Requires PostgreSQL (`pnpm db:embedded` or Docker).
 */
export default defineConfig({
  testDir: './e2e-auth',
  globalSetup: './e2e-auth/global-setup.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: WEB_URL, locale: 'vi-VN', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } },
    },
  ],
  webServer: [
    {
      command: [
        'pnpm --filter @tienlen/server exec tsx test/prepare-database.cli.ts',
        'pnpm --filter @tienlen/server exec tsc -p tsconfig.build.json --outDir dist-e2e --tsBuildInfoFile dist-e2e/.tsbuildinfo',
        'node ../server/dist-e2e/main.js',
      ].join(' && '),
      url: `${API_URL}/health/live`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'warn',
        PORT: String(API_PORT),
        DATABASE_URL: e2eDatabaseUrl(),
        WEB_ORIGIN: WEB_URL,
        MAIL_OUTBOX_DIR: MAIL_DIR,
        UPLOAD_DIR,
        API_PUBLIC_URL: API_URL,
      },
    },
    {
      command: `pnpm exec next build && pnpm exec next start --port ${WEB_PORT}`,
      url: WEB_URL,
      // A production build takes several minutes on slower machines.
      timeout: 600_000,
      reuseExistingServer: false,
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_PUBLIC_UI_PREVIEW: 'false',
        NEXT_PUBLIC_API_URL: API_URL,
        API_INTERNAL_URL: API_URL,
      },
    },
  ],
});
