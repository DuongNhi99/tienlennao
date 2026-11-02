import { execSync } from 'node:child_process';
import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

const workspaceRoot = path.resolve(process.cwd(), '../..');

// The monorepo keeps one .env at the root; apps/web/.env* files (if any) still take precedence.
loadEnvConfig(workspaceRoot);

/**
 * Optional same-origin API proxy (hosting where the API runs elsewhere, e.g. Vercel + Render;
 * see docs/DEPLOYMENT.md): /api/v1/* is forwarded to this origin, so the session cookie stays
 * first-party. WebSockets cannot pass through such a proxy, so Socket.IO uses long-polling.
 */
const apiProxyOrigin = process.env.API_PROXY_ORIGIN?.replace(/\/+$/, '') || undefined;
if (apiProxyOrigin) {
  // On Vercel the public API URL is this deployment's own production domain.
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!process.env.NEXT_PUBLIC_API_URL && productionHost) {
    process.env.NEXT_PUBLIC_API_URL = `https://${productionHost}/api/v1`;
  }
  process.env.NEXT_PUBLIC_SOCKET_POLLING_ONLY = 'true';
}

/** Identifies a deployment; versions the service worker caches. */
function resolveBuildId(): string {
  if (process.env.BUILD_ID) return process.env.BUILD_ID;
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
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
  // Docker images ship the self-contained server (apps/web/Dockerfile sets NEXT_OUTPUT).
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  generateBuildId: () => buildId,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  // Socket.IO's path ends with a slash (/api/v1/socket.io/); keep it when proxying.
  skipTrailingSlashRedirect: Boolean(apiProxyOrigin),
  rewrites() {
    if (!apiProxyOrigin) return Promise.resolve([]);
    return Promise.resolve({
      beforeFiles: [
        { source: '/api/v1/:path*/', destination: `${apiProxyOrigin}/api/v1/:path*/` },
        { source: '/api/v1/:path*', destination: `${apiProxyOrigin}/api/v1/:path*` },
      ],
      afterFiles: [],
      fallback: [],
    });
  },
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
