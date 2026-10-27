// Development-only fallback for machines without Docker: runs a real PostgreSQL server from
// the `embedded-postgres` npm binaries, using the credentials in DATABASE_URL.
// Data is stored in .local/pgdata (git-ignored). Stop with Ctrl+C.
import { existsSync } from 'node:fs';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const root = path.resolve(import.meta.dirname, '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
const databaseName = decodeURIComponent(url.pathname.slice(1));
const dataDir = path.join(root, '.local', 'pgdata');
const port = Number(url.port || 5432);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  port,
  persistent: true,
  // Windows defaults to a WIN1252 cluster, which cannot store Vietnamese text.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
  console.log(`Initialising data directory at ${dataDir} ...`);
  await pg.initialise();
}
await pg.start();

const client = pg.getPgClient();
await client.connect();
const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
  databaseName,
]);
await client.end();
if (rowCount === 0) {
  await pg.createDatabase(databaseName);
  console.log(`Created database "${databaseName}".`);
}

console.log(`PostgreSQL is running on localhost:${port} (database "${databaseName}").`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('Stopping PostgreSQL ...');
  await pg.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// Keep the process alive while the server runs.
setInterval(() => {}, 1 << 30);
