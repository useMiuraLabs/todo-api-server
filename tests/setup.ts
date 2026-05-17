import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

// src/env.ts / src/db/client.ts は import 時に env を評価する singleton のため、
// それらを動的 import する前に必ず process.env を書き換える。

const TEST_DB_DIR = resolve(process.cwd(), 'tests');
const TEST_DB_PATH = resolve(TEST_DB_DIR, '.test.db');

for (const suffix of ['', '-wal', '-shm', '-journal']) {
  const p = TEST_DB_PATH + suffix;
  if (existsSync(p)) rmSync(p);
}
if (!existsSync(TEST_DB_DIR)) mkdirSync(TEST_DB_DIR, { recursive: true });

process.env.DATABASE_URL = `file:${TEST_DB_PATH}`;
process.env.BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ?? 'test-secret-test-secret-test-secret-1234';
process.env.BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:8931';
process.env.CORS_ORIGIN = '*';
process.env.PORT = process.env.PORT ?? '8931';

const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
const { db } = await import('../src/db/client');

migrate(db, { migrationsFolder: './drizzle' });
