import { rmSync } from 'node:fs';
import { MAIL_DIR } from './env';

/** Starts every run with an empty outbox, so tests only see emails they caused. */
export default function globalSetup() {
  rmSync(MAIL_DIR, { recursive: true, force: true });
}
