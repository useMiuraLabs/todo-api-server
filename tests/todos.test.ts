import { beforeEach, describe, expect, it } from 'vitest';

import { app } from '../src/index';
import { ErrorCode } from '../src/lib/errors';
import {
  authedFetch,
  createNTodos,
  createTodo,
  resetDb,
  signUp,
  signUpAndSignIn,
  uniqueEmail,
  type CreatedTodo,
} from './helpers';

interface Todo extends CreatedTodo {}

interface ListResponse {
  items: Todo[];
  nextCursor: string | null;
}

interface PageResponse {
  items: Todo[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

beforeEach(async () => {
  await resetDb();
});

describe('GET /api/todos (cursor pagination)', () => {
  describe('success', () => {
    it('自分の todos を items + nextCursor で返す', async () => {
      const { cookie } = await signUpAndSignIn(app);
      await createNTodos(app, cookie, 3);

      const res = await authedFetch(app, cookie, '/api/todos');
      expect(res.status).toBe(200);
      const body = (await res.json()) as ListResponse;
      expect(body.items).toHaveLength(3);
      expect(body.nextCursor).toBeNull();
    });

    it('空の場合 items=[], nextCursor=null', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos');
      expect(res.status).toBe(200);
      const body = (await res.json()) as ListResponse;
      expect(body.items).toEqual([]);
      expect(body.nextCursor).toBeNull();
    });

    it('limit 指定で件数が limit と一致する', async () => {
      const { cookie } = await signUpAndSignIn(app);
      await createNTodos(app, cookie, 5);
      const res = await authedFetch(app, cookie, '/api/todos?limit=3');
      const body = (await res.json()) as ListResponse;
      expect(body.items).toHaveLength(3);
      expect(body.nextCursor).not.toBeNull();
    });
  });

  describe('filter', () => {
    it('done=true で done=true のみ返る', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t = await createTodo(app, cookie, { title: 'a' });
      await createTodo(app, cookie, { title: 'b' });
      await authedFetch(app, cookie, `/api/todos/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: true }),
      });

      const res = await authedFetch(app, cookie, '/api/todos?done=true');
      const body = (await res.json()) as ListResponse;
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.done).toBe(true);
    });

    it('done=false で done=false のみ返る', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t = await createTodo(app, cookie, { title: 'a' });
      await createTodo(app, cookie, { title: 'b' });
      await authedFetch(app, cookie, `/api/todos/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: true }),
      });

      const res = await authedFetch(app, cookie, '/api/todos?done=false');
      const body = (await res.json()) as ListResponse;
      expect(body.items).toHaveLength(1);
      expect(body.items[0]!.done).toBe(false);
    });
  });

  describe('sort', () => {
    it('デフォルト (sort=-created_at) は新しい順', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const a = await createTodo(app, cookie, { title: 'a' });
      const b = await createTodo(app, cookie, { title: 'b' });
      const c = await createTodo(app, cookie, { title: 'c' });
      const res = await authedFetch(app, cookie, '/api/todos');
      const body = (await res.json()) as ListResponse;
      expect(body.items.map((t) => t.id)).toEqual([c.id, b.id, a.id]);
    });

    it('sort=due_date は古い due_date 順 (asc)', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const dates = [
        '2026-03-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        '2026-02-01T00:00:00.000Z',
      ];
      for (const d of dates) {
        await createTodo(app, cookie, { title: `t-${d}`, due_date: d });
      }
      const res = await authedFetch(app, cookie, '/api/todos?sort=due_date');
      const body = (await res.json()) as ListResponse;
      expect(body.items.map((t) => t.due_date)).toEqual([
        '2026-01-01T00:00:00.000Z',
        '2026-02-01T00:00:00.000Z',
        '2026-03-01T00:00:00.000Z',
      ]);
    });

    it('sort=-due_date は新しい due_date 順 (desc)', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const dates = [
        '2026-03-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        '2026-02-01T00:00:00.000Z',
      ];
      for (const d of dates) {
        await createTodo(app, cookie, { title: `t-${d}`, due_date: d });
      }
      const res = await authedFetch(app, cookie, '/api/todos?sort=-due_date');
      const body = (await res.json()) as ListResponse;
      expect(body.items.map((t) => t.due_date)).toEqual([
        '2026-03-01T00:00:00.000Z',
        '2026-02-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
      ]);
    });
  });

  describe('pagination boundaries', () => {
    it('25 件 + limit=10 → ページ 1 (10件,nextCursor) → ページ 2 (10件,nextCursor) → ページ 3 (5件,null)', async () => {
      const { cookie } = await signUpAndSignIn(app);
      await createNTodos(app, cookie, 25);

      const p1 = (await (
        await authedFetch(app, cookie, '/api/todos?limit=10')
      ).json()) as ListResponse;
      expect(p1.items).toHaveLength(10);
      expect(p1.nextCursor).not.toBeNull();

      const p2 = (await (
        await authedFetch(
          app,
          cookie,
          `/api/todos?limit=10&cursor=${encodeURIComponent(p1.nextCursor!)}`,
        )
      ).json()) as ListResponse;
      expect(p2.items).toHaveLength(10);
      expect(p2.nextCursor).not.toBeNull();

      const p3 = (await (
        await authedFetch(
          app,
          cookie,
          `/api/todos?limit=10&cursor=${encodeURIComponent(p2.nextCursor!)}`,
        )
      ).json()) as ListResponse;
      expect(p3.items).toHaveLength(5);
      expect(p3.nextCursor).toBeNull();

      const allIds = new Set([...p1.items, ...p2.items, ...p3.items].map((t) => t.id));
      expect(allIds.size).toBe(25);
    });

    it('limit=1 で 1 件', async () => {
      const { cookie } = await signUpAndSignIn(app);
      await createNTodos(app, cookie, 3);
      const res = await authedFetch(app, cookie, '/api/todos?limit=1');
      const body = (await res.json()) as ListResponse;
      expect(body.items).toHaveLength(1);
      expect(body.nextCursor).not.toBeNull();
    });

    it('limit=100 (max) で 100 件投入 → 全件返る', async () => {
      const { cookie } = await signUpAndSignIn(app);
      await createNTodos(app, cookie, 100);
      const res = await authedFetch(app, cookie, '/api/todos?limit=100');
      const body = (await res.json()) as ListResponse;
      expect(body.items).toHaveLength(100);
      expect(body.nextCursor).toBeNull();
    });

    it('limit=101 → 400 VALIDATION_ERROR (max 100 超過)', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos?limit=101');
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('limit=0 → 400 (min 1 違反)', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos?limit=0');
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('cursor 改竄 (ランダム文字列): decode 失敗時は無視して 200 を返す', async () => {
      const { cookie } = await signUpAndSignIn(app);
      await createNTodos(app, cookie, 3);
      const res = await authedFetch(app, cookie, '/api/todos?cursor=zzzzzzz');
      expect(res.status).toBe(200);
      const body = (await res.json()) as ListResponse;
      expect(Array.isArray(body.items)).toBe(true);
    });
  });

  describe('errors', () => {
    it('未認証 → 401 UNAUTHORIZED', async () => {
      const res = await app.request('/api/todos');
      expect(res.status).toBe(401);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it('sort=invalid_field → 400 VALIDATION_ERROR', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos?sort=invalid_field');
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });
  });
});

describe('GET /api/todos/page/:n (offset pagination)', () => {
  describe('success', () => {
    it('25 件 + page=1, size=10 → items=10, hasNext=true, hasPrev=false', async () => {
      const { cookie } = await signUpAndSignIn(app);
      await createNTodos(app, cookie, 25);
      const res = await authedFetch(app, cookie, '/api/todos/page/1?size=10');
      expect(res.status).toBe(200);
      const body = (await res.json()) as PageResponse;
      expect(body.items).toHaveLength(10);
      expect(body.page).toBe(1);
      expect(body.size).toBe(10);
      expect(body.total).toBe(25);
      expect(body.hasNext).toBe(true);
      expect(body.hasPrev).toBe(false);
    });

    it('page=2, size=10 → items=10, hasNext=true, hasPrev=true', async () => {
      const { cookie } = await signUpAndSignIn(app);
      await createNTodos(app, cookie, 25);
      const res = await authedFetch(app, cookie, '/api/todos/page/2?size=10');
      const body = (await res.json()) as PageResponse;
      expect(body.items).toHaveLength(10);
      expect(body.hasNext).toBe(true);
      expect(body.hasPrev).toBe(true);
    });

    it('page=3, size=10 → items=5, hasNext=false, hasPrev=true', async () => {
      const { cookie } = await signUpAndSignIn(app);
      await createNTodos(app, cookie, 25);
      const res = await authedFetch(app, cookie, '/api/todos/page/3?size=10');
      const body = (await res.json()) as PageResponse;
      expect(body.items).toHaveLength(5);
      expect(body.hasNext).toBe(false);
      expect(body.hasPrev).toBe(true);
    });
  });

  describe('size boundaries', () => {
    it('size=1 OK', async () => {
      const { cookie } = await signUpAndSignIn(app);
      await createNTodos(app, cookie, 3);
      const res = await authedFetch(app, cookie, '/api/todos/page/1?size=1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as PageResponse;
      expect(body.items).toHaveLength(1);
    });

    it('size=100 (max) OK', async () => {
      const { cookie } = await signUpAndSignIn(app);
      await createNTodos(app, cookie, 3);
      const res = await authedFetch(app, cookie, '/api/todos/page/1?size=100');
      expect(res.status).toBe(200);
    });

    it('size=101 → 400', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos/page/1?size=101');
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('size=0 → 400', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos/page/1?size=0');
      expect(res.status).toBe(400);
    });
  });

  describe('page boundaries', () => {
    it('page=0 → 400', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos/page/0');
      expect(res.status).toBe(400);
    });

    it('page=-1 → 400', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos/page/-1');
      expect(res.status).toBe(400);
    });

    it("page='abc' (非数値) → 400", async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos/page/abc');
      expect(res.status).toBe(400);
    });

    it('範囲外 (total=5, page=100) → 200 + items=[] + hasNext=false', async () => {
      const { cookie } = await signUpAndSignIn(app);
      await createNTodos(app, cookie, 5);
      const res = await authedFetch(app, cookie, '/api/todos/page/100?size=10');
      expect(res.status).toBe(200);
      const body = (await res.json()) as PageResponse;
      expect(body.items).toEqual([]);
      expect(body.hasNext).toBe(false);
      expect(body.total).toBe(5);
    });
  });

  describe('errors', () => {
    it('未認証 → 401', async () => {
      const res = await app.request('/api/todos/page/1');
      expect(res.status).toBe(401);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });
});

describe('POST /api/todos', () => {
  describe('success', () => {
    it('最小フィールド (title のみ) → 201', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos', {
        method: 'POST',
        body: JSON.stringify({ title: 'min' }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as Todo;
      expect(body.title).toBe('min');
      expect(body.done).toBe(false);
      expect(body.description).toBeNull();
      expect(body.due_date).toBeNull();
    });

    it('全フィールド → 201', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos', {
        method: 'POST',
        body: JSON.stringify({
          title: 'full',
          description: 'desc',
          due_date: '2026-05-20T10:00:00.000Z',
        }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as Todo;
      expect(body.title).toBe('full');
      expect(body.description).toBe('desc');
      expect(body.due_date).toBe('2026-05-20T10:00:00.000Z');
    });
  });

  describe('validation', () => {
    it('空 title → 400', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos', {
        method: 'POST',
        body: JSON.stringify({ title: '' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('title 200 文字ちょうど → 201', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos', {
        method: 'POST',
        body: JSON.stringify({ title: 'a'.repeat(200) }),
      });
      expect(res.status).toBe(201);
    });

    it('title 201 文字 → 400', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos', {
        method: 'POST',
        body: JSON.stringify({ title: 'a'.repeat(201) }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('不正 due_date 文字列 → 400', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos', {
        method: 'POST',
        body: JSON.stringify({ title: 't', due_date: 'not-a-date' }),
      });
      expect(res.status).toBe(400);
    });

    it('Create では done を受け付けず常に false で作成される', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos', {
        method: 'POST',
        body: JSON.stringify({ title: 't', done: true }),
      });
      expect(res.status).toBe(201);
      const body = (await res.json()) as Todo;
      expect(body.done).toBe(false);
    });
  });

  describe('errors', () => {
    it('未認証 → 401', async () => {
      const res = await app.request('/api/todos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 't' }),
      });
      expect(res.status).toBe(401);
    });
  });
});

describe('GET /api/todos/:id', () => {
  describe('success', () => {
    it('自分の todo → 200', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const created = await createTodo(app, cookie);
      const res = await authedFetch(app, cookie, `/api/todos/${created.id}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Todo;
      expect(body.id).toBe(created.id);
    });
  });

  describe('errors', () => {
    it('他人の todo → 404 TODO_NOT_FOUND', async () => {
      const a = await signUpAndSignIn(app, uniqueEmail('a'));
      const b = await signUpAndSignIn(app, uniqueEmail('b'));
      const t = await createTodo(app, a.cookie);
      const res = await authedFetch(app, b.cookie, `/api/todos/${t.id}`);
      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe(ErrorCode.TODO_NOT_FOUND);
    });

    it('存在しない id → 404', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe(ErrorCode.TODO_NOT_FOUND);
    });

    it('不正な id 形式 → 404 (uuid validation を入れない方針)', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(app, cookie, '/api/todos/not-a-uuid');
      expect(res.status).toBe(404);
    });

    it('削除済み (soft delete) → 404', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t = await createTodo(app, cookie);
      await authedFetch(app, cookie, `/api/todos/${t.id}`, { method: 'DELETE' });
      const res = await authedFetch(app, cookie, `/api/todos/${t.id}`);
      expect(res.status).toBe(404);
    });

    it('未認証 → 401', async () => {
      const res = await app.request('/api/todos/anyid');
      expect(res.status).toBe(401);
    });
  });
});

describe('PATCH /api/todos/:id', () => {
  describe('success', () => {
    it('title だけ更新 → 200', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t = await createTodo(app, cookie, { title: 'old' });
      const res = await authedFetch(app, cookie, `/api/todos/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'new' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Todo;
      expect(body.title).toBe('new');
      expect(body.done).toBe(false);
    });

    it('done だけ true に更新 → 200', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t = await createTodo(app, cookie);
      const res = await authedFetch(app, cookie, `/api/todos/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: true }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Todo;
      expect(body.done).toBe(true);
    });

    it('部分更新 (title + description) → 200', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t = await createTodo(app, cookie);
      const res = await authedFetch(app, cookie, `/api/todos/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'x', description: 'y' }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Todo;
      expect(body.title).toBe('x');
      expect(body.description).toBe('y');
    });
  });

  describe('validation', () => {
    it('空 title → 400', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t = await createTodo(app, cookie);
      const res = await authedFetch(app, cookie, `/api/todos/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: '' }),
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('done に文字列 → 400', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t = await createTodo(app, cookie);
      const res = await authedFetch(app, cookie, `/api/todos/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ done: 'yes' }),
      });
      expect(res.status).toBe(400);
    });

    it('body 空 ({}) → 200 no-op で現在の todo を返す (PATCH 冪等)', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t = await createTodo(app, cookie, { title: 'keep' });
      const res = await authedFetch(app, cookie, `/api/todos/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as Todo;
      expect(body.id).toBe(t.id);
      expect(body.title).toBe('keep');
      expect(body.updated_at).toBe(t.updated_at);
    });
  });

  describe('errors', () => {
    it('他人の todo → 404', async () => {
      const a = await signUpAndSignIn(app, uniqueEmail('a'));
      const b = await signUpAndSignIn(app, uniqueEmail('b'));
      const t = await createTodo(app, a.cookie);
      const res = await authedFetch(app, b.cookie, `/api/todos/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'hijack' }),
      });
      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe(ErrorCode.TODO_NOT_FOUND);
    });

    it('存在しない id → 404', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const res = await authedFetch(
        app,
        cookie,
        '/api/todos/00000000-0000-0000-0000-000000000000',
        { method: 'PATCH', body: JSON.stringify({ title: 'x' }) },
      );
      expect(res.status).toBe(404);
    });

    it('削除済み → 404', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t = await createTodo(app, cookie);
      await authedFetch(app, cookie, `/api/todos/${t.id}`, { method: 'DELETE' });
      const res = await authedFetch(app, cookie, `/api/todos/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title: 'x' }),
      });
      expect(res.status).toBe(404);
    });

    it('未認証 → 401', async () => {
      const res = await app.request('/api/todos/anyid', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'x' }),
      });
      expect(res.status).toBe(401);
    });
  });
});

describe('DELETE /api/todos/:id', () => {
  describe('success', () => {
    it('削除成功 → 200 { deleted: true }', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t = await createTodo(app, cookie);
      const res = await authedFetch(app, cookie, `/api/todos/${t.id}`, { method: 'DELETE' });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { deleted: true };
      expect(body.deleted).toBe(true);
    });

    it('直後の GET → 404 (soft delete されている)', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t = await createTodo(app, cookie);
      await authedFetch(app, cookie, `/api/todos/${t.id}`, { method: 'DELETE' });
      const res = await authedFetch(app, cookie, `/api/todos/${t.id}`);
      expect(res.status).toBe(404);
    });

    it('一覧から消える', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t1 = await createTodo(app, cookie, { title: 'keep' });
      const t2 = await createTodo(app, cookie, { title: 'gone' });
      await authedFetch(app, cookie, `/api/todos/${t2.id}`, { method: 'DELETE' });
      const list = (await (await authedFetch(app, cookie, '/api/todos')).json()) as ListResponse;
      expect(list.items.map((t) => t.id)).toEqual([t1.id]);
    });
  });

  describe('errors', () => {
    it('すでに削除済みの id → 404', async () => {
      const { cookie } = await signUpAndSignIn(app);
      const t = await createTodo(app, cookie);
      await authedFetch(app, cookie, `/api/todos/${t.id}`, { method: 'DELETE' });
      const res = await authedFetch(app, cookie, `/api/todos/${t.id}`, { method: 'DELETE' });
      expect(res.status).toBe(404);
      const body = (await res.json()) as ErrorBody;
      expect(body.error.code).toBe(ErrorCode.TODO_NOT_FOUND);
    });

    it('他人の todo → 404', async () => {
      const a = await signUpAndSignIn(app, uniqueEmail('a'));
      const b = await signUpAndSignIn(app, uniqueEmail('b'));
      const t = await createTodo(app, a.cookie);
      const res = await authedFetch(app, b.cookie, `/api/todos/${t.id}`, { method: 'DELETE' });
      expect(res.status).toBe(404);
    });

    it('未認証 → 401', async () => {
      const res = await app.request('/api/todos/anyid', { method: 'DELETE' });
      expect(res.status).toBe(401);
    });
  });
});

void signUp;
