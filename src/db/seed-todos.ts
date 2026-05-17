import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { eq } from 'drizzle-orm';

import { db } from './client';
import { todos, user } from './schema';

export type SeedTodosOptions = {
  userId: string;
  count?: number;
};

export type SeedTodosResult = {
  userId: string;
  created: number;
};

export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`user not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

export async function seedTodos(opts: SeedTodosOptions): Promise<SeedTodosResult> {
  const count = opts.count ?? 3;

  const found = db.select().from(user).where(eq(user.id, opts.userId)).get();
  if (!found) {
    throw new UserNotFoundError(opts.userId);
  }

  const rows = Array.from({ length: count }, (_, i) => ({
    userId: opts.userId,
    title: `Seeded Todo #${i + 1}`,
    description: null,
    done: false,
  }));

  if (rows.length > 0) {
    await db.insert(todos).values(rows);
  }

  return { userId: opts.userId, created: rows.length };
}

async function main() {
  // pnpm が `--` を script の argv 先頭に挿入するため除去 (parseArgs は `--` 以降を読まない)。
  const rawArgs = process.argv.slice(2);
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs;

  const { values } = parseArgs({
    args,
    options: {
      'user-id': { type: 'string' },
      count: { type: 'string' },
    },
    strict: true,
    allowPositionals: true,
  });

  const userId = values['user-id'];
  if (!userId) {
    console.error('error: --user-id is required');
    console.error('usage: pnpm db:seed:todos -- --user-id=<id> [--count=3]');
    process.exit(1);
  }

  const count = values.count !== undefined ? Number(values.count) : 3;
  if (!Number.isInteger(count) || count < 0) {
    console.error(`error: --count must be a non-negative integer (got: ${values.count})`);
    process.exit(1);
  }

  try {
    const result = await seedTodos({ userId, count });
    console.log(`seed:todos done. user_id=${result.userId} created=${result.created}`);
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
