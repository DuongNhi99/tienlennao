import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** Ports differ from `pnpm dev` (3000/4000) and the preview tests (3100), so all can coexist. */
export const WEB_PORT = 3200;
export const API_PORT = 4100;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const API_URL = `http://localhost:${API_PORT}/api/v1`;

/** The API writes emails here (development outbox); tests read the links from it. */
export const MAIL_DIR = path.join(tmpdir(), 'tienlen-e2e-mail');
export const UPLOAD_DIR = path.join(tmpdir(), 'tienlen-e2e-uploads');

/** `<DATABASE_URL database>_e2e`: created, migrated and emptied before the API starts. */
export function e2eDatabaseUrl(): string {
  const rootEnv = path.resolve(process.cwd(), '../../.env');
  if (!process.env.DATABASE_URL && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('Set DATABASE_URL to run the authentication browser tests.');
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/$/, '')}_e2e`;
  return url.toString();
}
