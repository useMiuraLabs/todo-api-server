import { swaggerUI } from '@hono/swagger-ui';
import { $, OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { auth } from './auth';
import { authMiddleware, type User, type Session } from './auth/middleware';
import { env } from './env';
import { ErrorCode, errorResponse } from './lib/errors';
import { health } from './routes/health';
import { landing } from './routes/landing';
import { todos } from './routes/todos';

const base = new OpenAPIHono<{ Variables: { user: User | null; session: Session | null } }>({
  defaultHook: (result, c) => {
    if (!result.success) {
      return c.json(
        {
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Request validation failed',
            details: result.error.issues,
          },
        },
        400,
      );
    }
  },
});

base.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
  type: 'apiKey',
  in: 'cookie',
  name: 'better-auth.session_token',
});
base.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
});

// `.use()` チェーンは Hono 型に縮退するため `$()` で OpenAPIHono 型を復元する。
const app = $(
  base
    .use('*', logger())
    .use(
      '*',
      cors({
        origin: env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',').map((o) => o.trim()),
        // CORS で credentials は wildcard origin と両立不可。
        credentials: env.CORS_ORIGIN !== '*',
      }),
    )
    .use('*', authMiddleware)
    .on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw)),
)
  .route('/', landing)
  .route('/health', health)
  .route('/api/todos', todos)
  .doc('/openapi.json', {
    openapi: '3.0.0',
    info: { title: 'todo-api-server', version: '0.1.0' },
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  })
  .get('/docs', swaggerUI({ url: '/openapi.json' }))
  .notFound((c) =>
    c.json({ error: { code: ErrorCode.NOT_FOUND, message: 'Route not found' } }, 404),
  )
  .onError((err, c) => {
    console.error(err);
    return errorResponse(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
  });

export { app };
export type AppType = typeof app;
