import { describe, expect, it } from 'vitest';

import { app } from '../src/index';
import { ErrorCode } from '../src/lib/errors';

describe('System endpoints', () => {
  it('GET / → 200 + HTML (todo-api-server を含む)', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toMatch(/text\/html/);
    const text = await res.text();
    expect(text).toContain('todo-api-server');
  });

  it('GET /health → 200 + JSON { status, db }', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; db: string };
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
  });

  it('GET /openapi.json → 200 + 有効 JSON + paths に /api/todos と /api/todos/page/{n}', async () => {
    const res = await app.request('/openapi.json');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { paths: Record<string, unknown>; openapi: string };
    expect(body.openapi).toBeDefined();
    expect(body.paths['/api/todos']).toBeDefined();
    expect(body.paths['/api/todos/page/{n}']).toBeDefined();
  });

  it('GET /docs → 200 + HTML (Swagger UI)', async () => {
    const res = await app.request('/docs');
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct).toMatch(/text\/html/);
    const text = await res.text();
    expect(text.toLowerCase()).toContain('swagger');
  });

  it('GET /nonexistent → 404 + 統一エラー形式 { error: { code: NOT_FOUND } }', async () => {
    const res = await app.request('/nonexistent');
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe(ErrorCode.NOT_FOUND);
  });
});
