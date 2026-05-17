import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import { env } from '../env';
import * as schema from './schema';

const dbPath = env.DATABASE_URL.replace(/^file:/, '');
const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle({ client: sqlite, schema });
export type DB = typeof db;
