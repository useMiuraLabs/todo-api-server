import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8931),
  DATABASE_URL: z.string().min(1).default('file:./data/app.db'),
  BETTER_AUTH_SECRET: z.string().min(32, {
    message:
      'BETTER_AUTH_SECRET must be at least 32 characters. Generate with: openssl rand -base64 32',
  }),
  BETTER_AUTH_URL: z.url().default('http://localhost:8931'),
  CORS_ORIGIN: z.url('フロントのURL入れて'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(JSON.stringify(z.treeifyError(parsed.error), null, 2));
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
