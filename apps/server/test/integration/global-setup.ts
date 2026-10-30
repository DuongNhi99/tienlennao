import { existsSync } from 'node:fs';
import path from 'node:path';
import type { TestProject } from 'vitest/node';
import { prepareThrowawayDatabase, throwawayUrl } from '../prepare-database';

/**
 * Prepares a dedicated, empty test database: TEST_DATABASE_URL, or `<DATABASE_URL database>_test`.
 */
export default async function setup(project: TestProject): Promise<void> {
  // Integration tests run from apps/server (see the test:integration script).
  const rootEnv = path.resolve(process.cwd(), '../../.env');
  if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  const base = process.env.DATABASE_URL;
  const testUrl = process.env.TEST_DATABASE_URL ?? (base && throwawayUrl(base, '_test'));
  if (!testUrl)
    throw new Error('Set DATABASE_URL (or TEST_DATABASE_URL) to run integration tests.');

  await prepareThrowawayDatabase(testUrl);
  project.provide('databaseUrl', testUrl);
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
