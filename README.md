# todo-api-server

[![CI](https://github.com/useMiuraLabs/todo-api-server/actions/workflows/ci.yml/badge.svg)](https://github.com/useMiuraLabs/todo-api-server/actions/workflows/ci.yml)

フロントエンド学習用に使い回せる、スタンドアロンの Todo API サーバー。新しいフレームワークを試すたびにバックエンドを書き直さず、これを起動して叩くだけで遊べる状態にすることを目的としています。

## 何ができるか

- Todo の CRUD (filter / sort / cursor + offset pagination / soft delete)
- 認証は Better Auth に一任 (Cookie セッション / JWT / Bearer / OAuth を同居)
- デモ用ユーザー (`demo@example.com` / `password123`) を seed で投入、すぐサインインして試せる
- OpenAPI スキーマと Swagger UI を自動配信 (`/openapi.json`, `/docs`)
- Hono RPC 用クライアント (`src/client.ts`) を同梱、TS フロントからは型付きで呼び出し可能
- SQLite (`better-sqlite3`) で単一ファイル完結、外部 DB 不要

## クイックスタート

### ローカル

```bash
pnpm run setup    # 初回のみ (依存 install + .env 生成 + DB 初期化)
pnpm dev
```

http://localhost:8931 でランディングページが見えます。

### Docker

```bash
pnpm run setup:docker
```

ヘルスチェックが通ったら http://localhost:8931 が使えます。

> **注意**: 必ず `pnpm run setup` の形で呼んでください。`pnpm setup` (run なし) は pnpm の組み込みコマンド (PATH 設定用) と衝突するため、別の動作をします。

### setup スクリプトがやること (冪等)

| 状態                  | 挙動                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `.env` 無し           | `.env.example` をコピー + `BETTER_AUTH_SECRET` を `openssl rand -base64 32` で自動生成         |
| `.env` あり (独自値)  | 触らない                                                                                       |
| `data/app.db` 無し    | `pnpm db:reset` (migrate + seed)                                                               |
| `data/app.db` あり    | `pnpm db:migrate` のみ (差分適用、既存データ保持)                                              |
| `setup:docker` 追加分 | `docker info` で daemon 検知 → `docker compose up -d --build` → `/health` を最大 30 秒リトライ |

何度実行しても既存環境を壊しません。

---

### 詳細セットアップ (手動)

`pnpm run setup` が内部でやっていることを手動で行う場合:

```bash
pnpm install
cp .env.example .env
# BETTER_AUTH_SECRET を生成して .env に書き込む
openssl rand -base64 32
pnpm db:reset
pnpm dev
```

## API

| URL                                | 用途                                  |
| ---------------------------------- | ------------------------------------- |
| http://localhost:8931/             | ランディングページ (HTML、人間向け)   |
| http://localhost:8931/health       | ヘルスチェック (JSON、機械/curl 向け) |
| http://localhost:8931/docs         | Swagger UI                            |
| http://localhost:8931/openapi.json | OpenAPI スキーマ                      |

### エンドポイント一覧

| Method | Path                      | 説明                                                                                                      |
| ------ | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| GET    | `/`                       | ランディングページ                                                                                        |
| GET    | `/health`                 | `{ status, db }` を返す                                                                                   |
| GET    | `/docs`                   | Swagger UI                                                                                                |
| GET    | `/openapi.json`           | OpenAPI スキーマ                                                                                          |
| POST   | `/api/auth/sign-up/email` | サインアップ (Better Auth)                                                                                |
| POST   | `/api/auth/sign-in/email` | サインイン (Better Auth)                                                                                  |
| POST   | `/api/auth/sign-out`      | サインアウト (Better Auth)                                                                                |
| GET    | `/api/auth/session`       | 現在のセッション取得                                                                                      |
| `*`    | `/api/auth/**`            | Better Auth その他 (OAuth, JWT 等)                                                                        |
| GET    | `/api/todos`              | 一覧 (cursor pagination、`done`, `sort=due_date,-created_at`, `limit`, `cursor`)                          |
| GET    | `/api/todos/page/:n`      | 一覧 (offset pagination、`done`, `sort`, `size`、`{ items, page, size, total, hasNext, hasPrev }` を返す) |
| POST   | `/api/todos`              | 作成                                                                                                      |
| GET    | `/api/todos/:id`          | 取得                                                                                                      |
| PATCH  | `/api/todos/:id`          | 更新                                                                                                      |
| DELETE | `/api/todos/:id`          | soft delete                                                                                               |

### エラーコード

自前ルート (`/api/todos/*`, ルート未一致時) は以下の形式で返します:

```json
{ "error": { "code": "ERROR_CODE", "message": "...", "details": null } }
```

| code             | HTTP | 発生条件                                                                              |
| ---------------- | ---- | ------------------------------------------------------------------------------------- |
| UNAUTHORIZED     | 401  | 認証必須エンドポイントに未認証アクセス                                                |
| VALIDATION_ERROR | 400  | リクエストボディ/クエリのバリデーション失敗。`details` に Zod エラーが入る            |
| TODO_NOT_FOUND   | 404  | 指定 id の todo が存在しない、または他人の todo (情報漏洩防止のため 403 ではなく 404) |
| NOT_FOUND        | 404  | 未定義ルート                                                                          |
| INTERNAL_ERROR   | 500  | サーバー内部エラー                                                                    |

OpenAPI 上は `components.schemas.ErrorResponse` として登録されており、`code` は上記 enum で型付けされています。openapi-typescript 等で生成すれば、フロント側は `code` を discriminated union で switch できます。

※ Better Auth エンドポイント (`/api/auth/*`) は Better Auth 独自のエラー形式 (`{ message, code? }` フラット) で返します。

## 認証

Better Auth により以下を**同時提供**しています。フロント側が好きな方式を選んで使えます。

- **Cookie セッション** (デフォルト) — SSR 系 (Next.js RSC 等) に向く
- **JWT** (`jwt` plugin) — TanStack Start, SPA, モバイル向け
- **Bearer トークン** (`bearer` plugin) — `Authorization: Bearer <token>` で叩きたいケース
- **OAuth** (`socialProviders`) — `GOOGLE_*` / `GITHUB_*` を `.env` に入れた provider のみ有効化

プロトタイピングは seed で投入されるデモアカウント (`demo@example.com` / `password123`) で sign in してください。

### curl サンプル

```bash
# サインアップ
curl -i -c cookie.txt -X POST http://localhost:8931/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"password123","name":"me"}'

# サインイン (cookie.txt にセッション Cookie が保存される)
curl -i -c cookie.txt -X POST http://localhost:8931/api/auth/sign-in/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"password123"}'

# Todo 作成
curl -b cookie.txt -X POST http://localhost:8931/api/todos \
  -H 'Content-Type: application/json' \
  -d '{"title":"buy milk","description":"2L"}'

# 一覧
curl -b cookie.txt 'http://localhost:8931/api/todos?done=false&sort=-created_at&limit=20'

# 完了
curl -b cookie.txt -X PATCH http://localhost:8931/api/todos/<id> \
  -H 'Content-Type: application/json' \
  -d '{"done":true}'
```

## フロントエンドからの利用

### 1. fetch + 生 JSON (どのフロントでも使える)

```ts
const res = await fetch('http://localhost:8931/api/todos', {
  credentials: 'include', // Cookie セッションを使う場合
});
const todos = await res.json();
```

### 2. 型生成 (openapi-typescript)

OpenAPI スキーマから型を生成すれば、任意のフロントで型付きで叩けます。

```bash
pnpm add -D openapi-typescript
pnpx openapi-typescript http://localhost:8931/openapi.json -o ./src/api-types.ts
```

### 3. Hono RPC (フロントも TypeScript なら最も型安全)

`src/client.ts` を import すれば、サーバーの型定義そのままで呼び出せます。

```ts
import { client } from 'todo-api-server/client';

const c = client('http://localhost:8931');
const res = await c.api.todos.$get();
const todos = await res.json();
```

## DB 運用

```bash
pnpm db:generate   # スキーマ変更後にマイグレーション SQL を生成
pnpm db:migrate    # マイグレーション適用
pnpm db:seed       # シードデータ投入 (demo user + todos 3 件)
pnpm db:seed:user  # demo user のみ作成 (Better Auth 経由、冪等)
pnpm db:seed:todos -- --user-id=<id> [--count=3]  # 指定 user に todos を追加
pnpm db:reset      # DB を初期化 (削除 → migrate → seed)
pnpm db:studio     # Drizzle Studio (ブラウザでテーブル閲覧)
```

## テスト

```bash
pnpm test       # watch モード
pnpm test:run   # 1回実行 (CI 用)
```

## Lint / Format

```bash
pnpm lint         # oxlint (.oxlintrc.json: correctness=error, suspicious|perf=warn)
pnpm format       # oxfmt (.oxfmtrc.json: singleQuote + sortImports 有効、書き換え)
pnpm format:check # oxfmt --check (差分があれば非ゼロ exit、CI 用)
```

## Git hooks (Lefthook)

`pnpm install` 時に [Lefthook](https://lefthook.dev/) が `prepare` script から自動セットアップされ、`pre-commit` でステージ済みファイルに対して `oxlint` と `oxfmt --check` を並列実行します。lint / format に違反があると commit はブロックされます (test は走らせず、commit を軽く保つ方針)。一時的に hook をスキップしたい場合は `LEFTHOOK=0 git commit ...` を使ってください。

## CI

GitHub Actions (`.github/workflows/ci.yml`) が `main` への push / PR ごとに `pnpm build` (型チェック) → `pnpm lint` → `pnpm format:check` → `pnpm test:run` を実行します。

## 技術スタック

| 領域                 | 採用                                        |
| -------------------- | ------------------------------------------- |
| 言語 / ランタイム    | TypeScript / Node.js                        |
| Web フレームワーク   | Hono                                        |
| ORM / DB             | Drizzle ORM / SQLite (better-sqlite3)       |
| 認証                 | Better Auth (Cookie / JWT / Bearer / OAuth) |
| バリデーション       | Zod                                         |
| API ドキュメント     | `@hono/zod-openapi` + Swagger UI            |
| テスト               | Vitest + Hono `app.request()`               |
| Lint / Format        | oxlint / oxfmt                              |
| パッケージマネージャ | pnpm                                        |

## 設計ドキュメント

設計思想・アーキテクチャ原則 (chainable ルーター、`c.notFound()` 禁止 等)・公式準拠ルールは [CLAUDE.md](./CLAUDE.md) を参照してください。
