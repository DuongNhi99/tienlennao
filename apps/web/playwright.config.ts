import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

// Installability/offline checks are browser-engine features; the desktop project covers them.
const DESKTOP_ONLY = /pwa\.spec\.ts$/;

/**
 * Browser tests run against a production build. The build enables UI preview mode so the
 * authenticated screens have (mock) data; Phases 3/5 switch these tests to the real backend.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'vi-VN',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile-360',
      testIgnore: DESKTOP_ONLY,
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 740 },
      },
    },
    {
      name: 'tablet',
      testIgnore: DESKTOP_ONLY,
      use: { ...devices['Desktop Chrome'], viewport: { width: 820, height: 1180 }, hasTouch: true },
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } },
    },
  ],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    timeout: 400_000,
    reuseExistingServer: !process.env.CI,
    env: { NEXT_PUBLIC_UI_PREVIEW: 'true', NEXT_DIST_DIR: '.next-preview' },
  },
});
