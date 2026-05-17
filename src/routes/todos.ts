import { $, createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { and, asc, desc, eq, gt, isNull, lt, or, sql, type SQL } from 'drizzle-orm';

import { requireAuth, type User } from '../auth/middleware';
import { db } from '../db/client';
import { todos as todosTable, todosInsertSchema, todosSelectSchema } from '../db/schema';
import { ErrorCode, ErrorResponseSchema } from '../lib/errors';

const dateToIso = z.date().transform((d) => d.toISOString());
const dateToIsoNullable = z
  .date()
  .nullable()
  .transform((d) => (d ? d.toISOString() : null));

const TodoSchema = todosSelectSchema
  .omit({ deletedAt: true })
  .extend({
    id: z.string().openapi({ example: 'b1c2d3e4-...' }),
    userId: z.string().openapi({ example: 'user-uuid' }),
    title: z.string().openapi({ example: 'Buy milk' }),
    description: z.string().nullable().openapi({ example: 'low-fat' }),
    done: z.boolean().openapi({ example: false }),
    dueDate: dateToIsoNullable.openapi({ example: '2026-05-20T10:00:00.000Z' }),
    createdAt: dateToIso,
    updatedAt: dateToIso,
  })
  .openapi('Todo');

const TodoResponseSchema = z
  .object({
    id: z.string().openapi({ example: 'b1c2d3e4-...' }),
    user_id: z.string().openapi({ example: 'user-uuid' }),
    title: z.string().openapi({ example: 'Buy milk' }),
    description: z.string().nullable().openapi({ example: 'low-fat' }),
    done: z.boolean().openapi({ example: false }),
    due_date: z.string().datetime().nullable().openapi({ example: '2026-05-20T10:00:00.000Z' }),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .openapi('Todo');

void TodoSchema;

const CreateTodoSchema = todosInsertSchema
  .pick({ title: true, description: true })
  .extend({
    title: z.string().min(1).max(200).openapi({ example: 'Buy milk' }),
    description: z.string().optional().openapi({ example: 'low-fat' }),
    due_date: z.string().datetime().optional().openapi({ example: '2026-05-20T10:00:00.000Z' }),
  })
  .openapi('CreateTodo');

const UpdateTodoSchema = CreateTodoSchema.partial()
  .extend({
    description: z.string().nullable().optional(),
    due_date: z.string().datetime().nullable().optional(),
    done: z.boolean().optional(),
  })
  .openapi('UpdateTodo');

const SortSchema = z
  .enum(['created_at', '-created_at', 'due_date', '-due_date', 'updated_at', '-updated_at'])
  .default('-created_at');

const ListQuerySchema = z.object({
  done: z.enum(['true', 'false']).optional().openapi({ example: 'false' }),
  sort: SortSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
  cursor: z.string().optional(),
});

const PageParamSchema = z.object({
  n: z.coerce
    .number()
    .int()
    .min(1)
    .openapi({ param: { name: 'n', in: 'path' }, example: 1 }),
});

const PageQuerySchema = z.object({
  done: z.enum(['true', 'false']).optional().openapi({ example: 'false' }),
  sort: SortSchema.optional(),
  size: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

const IdParamSchema = z.object({
  id: z
    .string()
    .min(1)
    .openapi({ param: { name: 'id', in: 'path' }, example: 'uuid' }),
});

const ListResponseSchema = z
  .object({
    items: z.array(TodoResponseSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi('TodoList');

const PageResponseSchema = z
  .object({
    items: z.array(TodoResponseSchema),
    page: z.number().int(),
    size: z.number().int(),
    total: z.number().int(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  })
  .openapi('TodoPage');

const DeletedResponseSchema = z.object({ deleted: z.literal(true) }).openapi('Deleted');

type TodoRow = typeof todosTable.$inferSelect;

const serialize = (row: TodoRow) => ({
  id: row.id,
  user_id: row.userId,
  title: row.title,
  description: row.description ?? null,
  done: row.done,
  due_date: row.dueDate ? row.dueDate.toISOString() : null,
  created_at: row.createdAt.toISOString(),
  updated_at: row.updatedAt.toISOString(),
});

const encodeCursor = (createdAt: Date, id: string) =>
  Buffer.from(`${createdAt.getTime()}_${id}`, 'utf8').toString('base64url');

const decodeCursor = (cursor: string): { createdAtMs: number; id: string } | null => {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = decoded.indexOf('_');
    if (sep < 0) return null;
    const createdAtMs = Number(decoded.slice(0, sep));
    const id = decoded.slice(sep + 1);
    if (!Number.isFinite(createdAtMs) || !id) return null;
    return { createdAtMs, id };
  } catch {
    return null;
  }
};

type SortKey =
  | 'created_at'
  | '-created_at'
  | 'due_date'
  | '-due_date'
  | 'updated_at'
  | '-updated_at';

const resolveSort = (sortKey: SortKey) => {
  const isDesc = sortKey.startsWith('-');
  const baseKey = (isDesc ? sortKey.slice(1) : sortKey) as 'created_at' | 'updated_at' | 'due_date';
  const sortColumn =
    baseKey === 'created_at'
      ? todosTable.createdAt
      : baseKey === 'updated_at'
        ? todosTable.updatedAt
        : todosTable.dueDate;
  return { isDesc, sortColumn };
};

const buildBaseFilters = (userId: string, done: 'true' | 'false' | undefined): SQL[] => {
  const filters: SQL[] = [eq(todosTable.userId, userId), isNull(todosTable.deletedAt)];
  if (done === 'true') filters.push(eq(todosTable.done, true));
  if (done === 'false') filters.push(eq(todosTable.done, false));
  return filters;
};

const todosBase = { tags: ['Todos'] };

const listRoute = createRoute({
  ...todosBase,
  method: 'get',
  path: '/',
  request: { query: ListQuerySchema },
  responses: {
    200: {
      description: 'List of todos (cursor pagination)',
      content: { 'application/json': { schema: ListResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const pageRoute = createRoute({
  ...todosBase,
  method: 'get',
  path: '/page/{n}',
  request: { params: PageParamSchema, query: PageQuerySchema },
  responses: {
    200: {
      description: 'List of todos (offset pagination)',
      content: { 'application/json': { schema: PageResponseSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const createTodoRoute = createRoute({
  ...todosBase,
  method: 'post',
  path: '/',
  request: {
    body: { content: { 'application/json': { schema: CreateTodoSchema } } },
  },
  responses: {
    201: {
      description: 'Created',
      content: { 'application/json': { schema: TodoResponseSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const getTodoRoute = createRoute({
  ...todosBase,
  method: 'get',
  path: '/{id}',
  request: { params: IdParamSchema },
  responses: {
    200: { description: 'Todo', content: { 'application/json': { schema: TodoResponseSchema } } },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const updateTodoRoute = createRoute({
  ...todosBase,
  method: 'patch',
  path: '/{id}',
  request: {
    params: IdParamSchema,
    body: { content: { 'application/json': { schema: UpdateTodoSchema } } },
  },
  responses: {
    200: {
      description: 'Updated',
      content: { 'application/json': { schema: TodoResponseSchema } },
    },
    400: {
      description: 'Validation error',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

const deleteTodoRoute = createRoute({
  ...todosBase,
  method: 'delete',
  path: '/{id}',
  request: { params: IdParamSchema },
  responses: {
    200: {
      description: 'Deleted',
      content: { 'application/json': { schema: DeletedResponseSchema } },
    },
    401: {
      description: 'Unauthorized',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
    404: {
      description: 'Not found',
      content: { 'application/json': { schema: ErrorResponseSchema } },
    },
  },
});

type Variables = { user: User | null; session: unknown };

export const todos = $(
  new OpenAPIHono<{ Variables: Variables }>({
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
  }).use('*', requireAuth),
)
  .openapi(listRoute, async (c) => {
    const user = c.get('user') as User;
    const q = c.req.valid('query');
    const limit = q.limit ?? 20;
    const sortKey = (q.sort ?? '-created_at') as SortKey;
    const { isDesc, sortColumn } = resolveSort(sortKey);

    const filters = buildBaseFilters(user.id, q.done);

    if (q.cursor) {
      const decoded = decodeCursor(q.cursor);
      if (decoded) {
        const cursorDate = new Date(decoded.createdAtMs);
        if (isDesc) {
          filters.push(
            or(
              lt(todosTable.createdAt, cursorDate),
              and(eq(todosTable.createdAt, cursorDate), lt(todosTable.id, decoded.id))!,
            )!,
          );
        } else {
          filters.push(
            or(
              gt(todosTable.createdAt, cursorDate),
              and(eq(todosTable.createdAt, cursorDate), gt(todosTable.id, decoded.id))!,
            )!,
          );
        }
      }
    }

    const orderBy = isDesc ? desc(sortColumn) : asc(sortColumn);
    const tieBreaker = isDesc ? desc(todosTable.id) : asc(todosTable.id);

    const rows = await db
      .select()
      .from(todosTable)
      .where(and(...filters))
      .orderBy(orderBy, tieBreaker)
      .limit(limit + 1);

    let nextCursor: string | null = null;
    const slice = rows.slice(0, limit);
    if (rows.length > limit) {
      const last = slice[slice.length - 1]!;
      nextCursor = encodeCursor(last.createdAt, last.id);
    }

    return c.json({ items: slice.map(serialize), nextCursor }, 200);
  })
  .openapi(pageRoute, async (c) => {
    const user = c.get('user') as User;
    const { n: page } = c.req.valid('param');
    const q = c.req.valid('query');
    const size = q.size ?? 20;
    const sortKey = (q.sort ?? '-created_at') as SortKey;
    const { isDesc, sortColumn } = resolveSort(sortKey);

    const filters = buildBaseFilters(user.id, q.done);
    const whereClause = and(...filters);

    const totalRow = await db
      .select({ count: sql<number>`count(*)` })
      .from(todosTable)
      .where(whereClause)
      .get();
    const total = Number(totalRow?.count ?? 0);

    const orderBy = isDesc ? desc(sortColumn) : asc(sortColumn);
    const tieBreaker = isDesc ? desc(todosTable.id) : asc(todosTable.id);

    const offset = (page - 1) * size;
    const rows = await db
      .select()
      .from(todosTable)
      .where(whereClause)
      .orderBy(orderBy, tieBreaker)
      .limit(size)
      .offset(offset);

    const hasPrev = page > 1;
    const hasNext = offset + rows.length < total;

    return c.json(
      {
        items: rows.map(serialize),
        page,
        size,
        total,
        hasNext,
        hasPrev,
      },
      200,
    );
  })
  .openapi(createTodoRoute, async (c) => {
    const user = c.get('user') as User;
    const body = c.req.valid('json');
    const [row] = await db
      .insert(todosTable)
      .values({
        userId: user.id,
        title: body.title,
        description: body.description ?? null,
        dueDate: body.due_date ? new Date(body.due_date) : null,
      })
      .returning();
    return c.json(serialize(row!), 201);
  })
  .openapi(getTodoRoute, async (c) => {
    const user = c.get('user') as User;
    const { id } = c.req.valid('param');
    const row = await db
      .select()
      .from(todosTable)
      .where(
        and(eq(todosTable.id, id), eq(todosTable.userId, user.id), isNull(todosTable.deletedAt)),
      )
      .get();
    if (!row) {
      return c.json({ error: { code: ErrorCode.TODO_NOT_FOUND, message: 'Todo not found' } }, 404);
    }
    return c.json(serialize(row), 200);
  })
  .openapi(updateTodoRoute, async (c) => {
    const user = c.get('user') as User;
    const { id } = c.req.valid('param');
    const body = c.req.valid('json');

    const patch: Partial<typeof todosTable.$inferInsert> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.done !== undefined) patch.done = body.done;
    if (body.due_date !== undefined) {
      patch.dueDate = body.due_date ? new Date(body.due_date) : null;
    }

    const existing = await db
      .select()
      .from(todosTable)
      .where(
        and(eq(todosTable.id, id), eq(todosTable.userId, user.id), isNull(todosTable.deletedAt)),
      )
      .get();
    if (!existing) {
      return c.json({ error: { code: ErrorCode.TODO_NOT_FOUND, message: 'Todo not found' } }, 404);
    }

    if (Object.keys(patch).length === 0) {
      return c.json(serialize(existing), 200);
    }

    const [updated] = await db
      .update(todosTable)
      .set(patch)
      .where(eq(todosTable.id, id))
      .returning();
    return c.json(serialize(updated!), 200);
  })
  .openapi(deleteTodoRoute, async (c) => {
    const user = c.get('user') as User;
    const { id } = c.req.valid('param');
    const existing = await db
      .select()
      .from(todosTable)
      .where(
        and(eq(todosTable.id, id), eq(todosTable.userId, user.id), isNull(todosTable.deletedAt)),
      )
      .get();
    if (!existing) {
      return c.json({ error: { code: ErrorCode.TODO_NOT_FOUND, message: 'Todo not found' } }, 404);
    }
    await db.update(todosTable).set({ deletedAt: new Date() }).where(eq(todosTable.id, id)).run();
    return c.json({ deleted: true as const }, 200);
  });
