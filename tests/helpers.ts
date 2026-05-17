import type { Hono } from 'hono';

type AnyHono = Hono<any, any, any>;

export function extractCookieHeader(res: Response): string {
  // Better Auth は複数 Set-Cookie を出すため getSetCookie を優先、未対応環境のみ fallback。
  const setCookies =
    typeof (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie === 'function'
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : ([res.headers.get('set-cookie')].filter(Boolean) as string[]);

  return setCookies
    .map((c) => c.split(';')[0]!.trim())
    .filter((c) => c.length > 0)
    .join('; ');
}

export interface SignUpResult {
  cookie: string;
  bearer: string | null;
  body: unknown;
}

export async function signUp(
  app: AnyHono,
  email: string,
  password: string,
  name = 'Test User',
): Promise<SignUpResult> {
  const res = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });
  const body = await res.json().catch(() => null);
  if (res.status !== 200) {
    throw new Error(`signUp failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return {
    cookie: extractCookieHeader(res),
    bearer: res.headers.get('set-auth-token'),
    body,
  };
}

export async function signIn(app: AnyHono, email: string, password: string): Promise<SignUpResult> {
  const res = await app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => null);
  if (res.status !== 200) {
    throw new Error(`signIn failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return {
    cookie: extractCookieHeader(res),
    bearer: res.headers.get('set-auth-token'),
    body,
  };
}

export async function authedFetch(
  app: AnyHono,
  cookie: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  headers.set('cookie', cookie);
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  return app.request(path, { ...init, headers });
}

export async function resetDb(): Promise<void> {
  const { db } = await import('../src/db/client');
  const { todos, session, account, verification, jwks, user } = await import('../src/db/schema');
  // 外部キー (todos.user_id → user.id 等) の都合上、子テーブルから削除する。
  db.delete(todos).run();
  db.delete(session).run();
  db.delete(account).run();
  db.delete(verification).run();
  db.delete(jwks).run();
  db.delete(user).run();
}

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export interface CreatedTodo {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  done: boolean;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export async function createTodo(
  app: AnyHono,
  cookie: string,
  body: Record<string, unknown> = {},
): Promise<CreatedTodo> {
  const payload = { title: 'todo', ...body };
  const res = await authedFetch(app, cookie, '/api/todos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (res.status !== 201) {
    const text = await res.text().catch(() => '');
    throw new Error(`createTodo failed (${res.status}): ${text}`);
  }
  return (await res.json()) as CreatedTodo;
}

// 直列で作成することで created_at の順序を保証する (cursor pagination テスト用)。
export async function createNTodos(
  app: AnyHono,
  cookie: string,
  n: number,
  mods?: (i: number) => Record<string, unknown>,
): Promise<CreatedTodo[]> {
  const out: CreatedTodo[] = [];
  for (let i = 0; i < n; i++) {
    const body = mods ? mods(i) : { title: `todo-${i.toString().padStart(3, '0')}` };
    out.push(await createTodo(app, cookie, body));
  }
  return out;
}

export async function signUpAndSignIn(
  app: AnyHono,
  email = uniqueEmail(),
  password = 'password1234',
): Promise<{ cookie: string; email: string }> {
  const { cookie } = await signUp(app, email, password);
  return { cookie, email };
}
