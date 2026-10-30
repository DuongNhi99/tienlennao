import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inject } from 'vitest';

// Runs in each test worker before the app module (and its ConfigModule) is imported.
process.env.DATABASE_URL = inject('databaseUrl');
process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), 'tienlen-uploads-'));
