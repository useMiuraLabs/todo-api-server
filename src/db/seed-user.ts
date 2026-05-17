import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import { auth } from '../auth';
import { db } from './client';
import { user } from './schema';

export type SeedUserOptions = {
  email?: string;
  password?: string;
  name?: string;
};

export type SeedUserResult = {
  id: string;
  email: string;
  created: boolean;
};

const DEFAULTS = {
  email: 'demo@example.com',
  password: 'password123',
  name: 'Demo User',
} as const;

export async function seedDemoUser(opts: SeedUserOptions = {}): Promise<SeedUserResult> {
  const email = opts.email ?? DEFAULTS.email;
  const password = opts.password ?? DEFAULTS.password;
  const name = opts.name ?? DEFAULTS.name;

  // Better Auth の signUpEmail は user 既存時に throw するので事前確認する。
  const existing = db.select().from(user).where(eq(user.email, email)).get();
  if (existing) {
    return { id: existing.id, email: existing.email, created: false };
  }

  const result = await auth.api.signUpEmail({
    body: { email, password, name },
  });

  if (result && 'user' in result && result.user?.id) {
    return { id: result.user.id, email: result.user.email, created: true };
  }

  const created = db.select().from(user).where(eq(user.email, email)).get();
  if (!created) {
    throw new Error(`failed to create demo user: ${email}`);
  }
  return { id: created.id, email: created.email, created: true };
}

async function main() {
  const result = await seedDemoUser();
  const status = result.created ? 'created' : 'exists';
  console.log(`seed:user done. id=${result.id} email=${result.email} status=${status}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
