/* eslint-disable no-console -- CLI script */
import { prepareThrowawayDatabase } from './prepare-database';

// Used by the web app's browser tests against the real API:
//   DATABASE_URL=postgresql://…/tienlen_e2e tsx test/prepare-database.cli.ts
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

prepareThrowawayDatabase(url).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
