import { inject } from 'vitest';

// Runs in each test worker before the app module (and its ConfigModule) is imported.
process.env.DATABASE_URL = inject('databaseUrl');
