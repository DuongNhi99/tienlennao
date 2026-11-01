import { execSync } from 'node:child_process';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

const workspaceRoot = path.resolve(process.cwd(), '../..');

// The monorepo keeps one .env at the root; apps/web/.env* files (if any) still take precedence.
loadEnvConfig(workspaceRoot);

/** Identifies a deployment; versions the service worker caches. */
function resolveBuildId(): string {
  if (process.env.BUILD_ID) return process.env.BUILD_ID;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return Date.now().toString(36);
  }
}
const buildId = resolveBuildId();

if (process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_UI_PREVIEW === 'true') {
  console.warn(
    '\n⚠  NEXT_PUBLIC_UI_PREVIEW=true: this build serves MOCK data on authenticated screens.' +
      '\n   Use it only for local testing — never deploy it.\n',
  );
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  // Browser tests build into their own folder, so they never clash with a running `next dev`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  generateBuildId: () => buildId,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  headers() {
    return Promise.resolve([
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]);
  },
};

export default nextConfig;
