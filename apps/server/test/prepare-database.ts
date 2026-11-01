import { execSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const serverDir = path.resolve(__dirname, '..');
const THROWAWAY_SUFFIXES = ['_test', '_e2e', '_load'];

/**
 * Creates (if missing), migrates and empties a throwaway database for automated tests.
 * Refuses any database whose name does not end in _test or _e2e, so it can never wipe the
 * development or production database.
 */
export async function prepareThrowawayDatabase(databaseUrl: string): Promise<void> {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!THROWAWAY_SUFFIXES.some((suffix) => database.endsWith(suffix))) {
    throw new Error(
      `Refusing to prepare "${database}": the name must end in _test, _e2e or _load.`,
    );
  }

  // CREATE DATABASE must run while connected to another database on the same server.
  const maintenance = new URL(url);
  maintenance.pathname = '/postgres';
  const admin = new PrismaClient({ datasourceUrl: maintenance.toString() });
  try {
    const rows = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${database}`;
    if (rows.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.$disconnect();
  }

  execSync('pnpm exec prisma migrate deploy', {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const db = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    // Cascades to every table that references users (sessions, wallets, ledger, …).
    await db.$executeRawUnsafe('TRUNCATE TABLE users CASCADE');
  } finally {
    await db.$disconnect();
  }
}

/** `<database>_<suffix>` on the same server as `baseUrl`. */
export function throwawayUrl(baseUrl: string, suffix: '_test' | '_e2e' | '_load'): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}${suffix}`;
  return url.toString();
}
