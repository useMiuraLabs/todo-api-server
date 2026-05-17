import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import type { FC } from 'hono/jsx';

import { db } from '../db/client';

type LandingProps = {
  uptimeSeconds: number;
  dbOk: boolean;
};

const Landing: FC<LandingProps> = ({ uptimeSeconds, dbOk }) => {
  const styles = `
    :root { color-scheme: light dark; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      max-width: 760px;
      margin: 2rem auto;
      padding: 0 1rem;
      line-height: 1.6;
    }
    h1 { margin-bottom: 0.2rem; }
    h2 { margin-top: 2rem; border-bottom: 1px solid #8884; padding-bottom: 0.2rem; }
    .meta { color: #8888; font-size: 0.9rem; }
    .status {
      display: inline-block;
      padding: 0.1rem 0.5rem;
      border-radius: 4px;
      font-size: 0.85rem;
      font-weight: bold;
    }
    .ok { background: #2c2; color: #fff; }
    .ng { background: #c22; color: #fff; }
    ul { padding-left: 1.2rem; }
    code, pre {
      background: #8881;
      border-radius: 4px;
    }
    code { padding: 0.05rem 0.3rem; }
    pre {
      padding: 0.8rem;
      overflow-x: auto;
      white-space: pre;
    }
    a { color: #06c; text-decoration: none; }
    a:hover { text-decoration: underline; }
  `;

  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>todo-api-server</title>
        <style>{styles}</style>
      </head>
      <body>
        <h1>todo-api-server</h1>
        <p class="meta">Frontend-agnostic Todo API. Hono + Drizzle + Better Auth + SQLite.</p>

        <h2>Status</h2>
        <ul>
          <li>
            Server: <span class="status ok">running</span> (uptime {uptimeSeconds}s)
          </li>
          <li>
            Database: <span class={dbOk ? 'status ok' : 'status ng'}>{dbOk ? 'ok' : 'error'}</span>
          </li>
        </ul>

        <h2>Endpoints</h2>
        <ul>
          <li>
            <a href="/docs">
              <strong>/docs</strong>
            </a>{' '}
            — Swagger UI (対話的に試せる)
          </li>
          <li>
            <a href="/openapi.json">/openapi.json</a> — OpenAPI スキーマ
          </li>
          <li>
            <a href="/health">/health</a> — ヘルスチェック (JSON)
          </li>
          <li>
            <code>POST /api/auth/sign-up/email</code> — Better Auth サインアップ
          </li>
          <li>
            <code>POST /api/auth/sign-in/email</code> — Better Auth サインイン
          </li>
          <li>
            <a href="/api/auth/session">/api/auth/session</a> — 現在のセッション
          </li>
          <li>
            <code>/api/todos</code> — Todo CRUD (要認証)
          </li>
        </ul>

        <h2>Quick start (curl)</h2>
        <p>1. サインアップ (cookie を保存):</p>
        <pre>
          {`curl -i -c cookies.txt -X POST http://localhost:8931/api/auth/sign-up/email \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com","password":"password123","name":"You"}'`}
        </pre>

        <p>2. サインイン (cookie を更新):</p>
        <pre>
          {`curl -i -c cookies.txt -b cookies.txt -X POST http://localhost:8931/api/auth/sign-in/email \\
  -H "Content-Type: application/json" \\
  -d '{"email":"you@example.com","password":"password123"}'`}
        </pre>

        <p>3. Todos 一覧 (cookie を送る):</p>
        <pre>{`curl -i -b cookies.txt http://localhost:8931/api/todos`}</pre>

        <p>4. Todo 作成 (Bearer トークン認証の場合の例):</p>
        <pre>
          {`curl -i -X POST http://localhost:8931/api/todos \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer <YOUR_TOKEN>" \\
  -d '{"title":"買い物","description":"牛乳","due_date":"2026-05-20T10:00:00.000Z"}'`}
        </pre>

        <p>5. Todo 一覧 (Bearer トークン):</p>
        <pre>
          {`curl -i http://localhost:8931/api/todos?done=false&sort=-created_at&limit=20 \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        </pre>

        <p>6. Todo 削除 (soft delete):</p>
        <pre>
          {`curl -i -X DELETE http://localhost:8931/api/todos/<TODO_ID> \\
  -H "Authorization: Bearer <YOUR_TOKEN>"`}
        </pre>
      </body>
    </html>
  );
};

export const landing = new Hono().get('/', (c) => {
  let dbOk = false;
  try {
    db.run(sql`SELECT 1`);
    dbOk = true;
  } catch {
    // DB 接続失敗時は degraded で返す。
  }
  const uptimeSeconds = Math.floor(process.uptime());
  return c.html(<Landing uptimeSeconds={uptimeSeconds} dbOk={dbOk} />);
});
