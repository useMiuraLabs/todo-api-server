import type { Context, MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';

import { ErrorCode } from '../lib/errors';
import { auth, type Session, type User } from './index';

export const authMiddleware: MiddlewareHandler = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set('user', session?.user ?? null);
  c.set('session', session?.session ?? null);
  await next();
});

export const requireAuth: MiddlewareHandler = createMiddleware(async (c, next) => {
  const u = c.get('user');
  if (!u) {
    return c.json(
      { error: { code: ErrorCode.UNAUTHORIZED, message: 'Authentication required' } },
      401,
    );
  }
  await next();
});

export type { Session, User };
export type AuthContext = Context<{ Variables: { user: User | null; session: Session | null } }>;
