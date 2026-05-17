import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { db } from '../db/client';

export const health = new Hono().get('/', (c) => {
  let dbOk = false;
  try {
    db.run(sql`SELECT 1`);
    dbOk = true;
  } catch {
  }
  return c.json({ status: dbOk ? 'ok' : 'degraded', db: dbOk ? 'ok' : 'error' });
});
