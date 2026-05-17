# todo-api-server

新しいフロントエンドフレームワークを学習するときに「即起動して使い回せる」汎用 Todo API サーバー。

## 目的 / 設計思想

- フロントエンドから**完全に独立**したスタンドアロン API として動作する
- 任意のフロント (Next.js, TanStack Start, React Router, モバイル等) から共通で使える
- 「起動 → すぐ使える」を最優先。複雑な初期設定を排する
- 認証は複数方式 (Cookie セッション / JWT / OAuth) を**同居**させ、フロント側が好きな方式を選べる

## 技術スタック

| 領域                    | 採用                                         | 理由                                                                            |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| 言語                    | TypeScript                                   | 型安全                                                                          |
| ランタイム              | Node.js                                      | エコシステム成熟                                                                |
| Web フレームワーク      | **Hono**                                     | Web 標準 (Request/Response) ベース、軽量、Better Auth 一級対応                  |
| ORM                     | **Drizzle ORM**                              | 型安全 + マイグレーション内蔵 + SQL ライク                                      |
| DB                      | SQLite (`better-sqlite3` ドライバ)           | 単一ファイルで完結、外部依存ゼロ                                                |
| 認証                    | **Better Auth**                              | Cookie/JWT/OAuth を1ライブラリで網羅                                            |
| バリデーション/スキーマ | Zod (+ `drizzle-zod`)                        | Hono / Drizzle / OpenAPI と一気通貫。DB スキーマから API スキーマの base を生成 |
| JSX (HTML 返却用)       | **`hono/jsx`**                               | `/health` 等の人間向けページに使用。React は入れない                            |
| API ドキュメント        | `@hono/zod-openapi` + Swagger UI             | Zod スキーマから OpenAPI 自動生成                                               |
| 型共有                  | OpenAPI (主) + Hono RPC (副)                 | フロントは生成 `.d.ts` または `hc()` から好きな方を選択                         |
| テスト                  | Vitest + Hono `app.request()`                | テスティングトロフィー (Integration 中心)                                       |
| ログ                    | Hono 標準 `logger()` ミドルウェア            | MVP 十分                                                                        |
| 設定管理                | `.env` + Zod による起動時バリデーション      | 不正値で fail-fast                                                              |
| コンテナ                | Docker (アプリのみ、SQLite は同梱ボリューム) | `docker compose up` で起動                                                      |
| パッケージマネージャ    | pnpm                                         |                                                                                 |
| Lint / Format           | **oxc (oxlint)**                             | Rust 製で高速、ESLint/Prettier 代替                                             |

## アーキテクチャ原則

### 1. ルーター定義は chainable で書く

Hono RPC の型推論はルーターのチェーン記法に依存します。**必ず chainable で書くこと**。

```ts
// OK
const todos = new Hono().get('/', listTodos).post('/', createTodo).get('/:id', getTodo);

// NG (型が落ちる)
const todos = new Hono();
todos.get('/', listTodos);
todos.post('/', createTodo);
```

これを守る限り `hc<typeof app>()` を export するだけで RPC が即有効化します。

### 2. ハンドラはルーター定義と同じファイルに書く

別ファイルに切り出すと RPC の型推論が壊れます。大きくなったら**ルーターごとファイル分割** (`routes/todos.ts`, `routes/health.ts`) して、ハンドラは中で完結させること。

公式: 「you should write handlers directly after path definitions」 (Hono Best Practices)

どうしてもコントローラー的に分離したい場合は **`factory.createHandlers()` (`hono/factory`)** を使うこと。素朴な関数切り出しでは型が落ちる。

### 2.5 `c.notFound()` を使わない

RPC クライアントが 404 レスポンスの型を解釈できなくなるため。**`c.json({ error: {...} }, 404)` でステータスコードを明示**すること。

公式: 「If you want to use a client, you should not use `c.notFound()` for the Not Found response. Please use `c.json()` and specify the status code」 (Hono RPC ガイド)

### 2.6 `tsconfig.json` で `strict: true` 必須

RPC の型推論が `strict: true` 前提で組まれているため、サーバー側・クライアント側 (型を import する側) の両方で必須。

公式: 「set `"strict": true` in `compilerOptions`」 (Hono RPC ガイド)

### 3. OpenAPI は契約、RPC はおまけ

- **対外契約は OpenAPI スキーマ**。これがサーバーの仕様の唯一の正解
- RPC は「Hono クライアント使うフロントがあれば便利」程度の位置付け
- API 変更時はまず OpenAPI スキーマ (Zod) を直す → ハンドラがそれに従う、の順

### 4. 認証はライブラリ任せ、自前実装しない

- パスワードハッシュ、セッション管理、トークン発行、OAuth フローはすべて Better Auth
- 自前で書くのは「Better Auth セッションから user_id を取り出して todo を絞り込む」程度のミドルウェア層のみ
- デモ用には `pnpm db:seed:user` で作成される `demo@example.com` / `password123` を使う (認証バイパスは設けない)

### 5. エラーレスポンス形式の統一

自前ルート (`/api/todos/*` 等) は以下の形式で統一:

```json
{ "error": { "code": "TODO_NOT_FOUND", "message": "Todo not found", "details": null } }
```

Better Auth エンドポイント (`/api/auth/*`) は Better Auth の独自形式のまま (これに合わせて書き換えない)。

#### エラーコードレジストリ (`src/lib/errors.ts`)

- 使用可能な `code` は `ErrorCode` 定数オブジェクトに集約 (`UNAUTHORIZED` / `NOT_FOUND` / `INTERNAL_ERROR` / `VALIDATION_ERROR` / `TODO_NOT_FOUND`)
- `errorResponse(c, status, code, message, details?)` の `code` 引数型は `ErrorCode` に絞られており、文字列リテラルの typo はコンパイル時に落ちる
- ハンドラ内で直接 `c.json({ error: { code: ErrorCode.XXX, ... }}, ...)` と書く箇所も同じ `ErrorCode` を使う
- `ErrorResponseSchema` を OpenAPI に `components.schemas.ErrorResponse` として登録済み。各 OpenAPI route の `responses` で `{ schema: ErrorResponseSchema }` を参照することで、フロント側が生成型から `code` を discriminated union で扱える

#### 新しい code を追加する手順

1. `src/lib/errors.ts` の `ErrorCode` に 1 行追加
2. その code を返す各 route の `createRoute({ responses })` に対応 HTTP ステータスを足し、`schema: ErrorResponseSchema` を指定
3. README の「エラーコード一覧」表を更新

## ディレクトリ構成

```
src/
  index.ts            # エントリポイント、アプリ組み立て、hc export
  env.ts              # Zod による env バリデーション
  db/
    schema.ts         # Drizzle スキーマ (users, sessions, accounts, verifications, todos)
    client.ts         # DB クライアント
    seed.ts           # シードデータ投入スクリプト
  auth/
    index.ts          # Better Auth インスタンス
    middleware.ts     # セッション → user_id 抽出
  routes/
    landing.tsx      # `/` ランディングページ (Hono JSX, HTML)
    health.ts        # `/health` JSON ヘルスチェック         # /health
    todos.ts          # /api/todos (CRUD + filter + sort + pagination)
  lib/
    errors.ts         # 統一エラー形式ヘルパー
tests/
  auth.test.ts        # signup → login → me → logout のフロー
  todos.test.ts       # 認証込みの CRUD / 他人の todo を触れないこと / pagination / filter
drizzle/              # マイグレーション SQL
data/                 # SQLite ファイル置き場 (gitignore)
.env.example
docker-compose.yml
Dockerfile
```

## DB スキーマ (初期)

### Better Auth 管理 (規約に従う)

- `user` (id, email, name, emailVerified, image, createdAt, updatedAt)
- `session` (id, userId, expiresAt, token, ipAddress, userAgent, createdAt, updatedAt)
- `account` (id, userId, providerId, accountId, password, accessToken, refreshToken, ...)
- `verification` (id, identifier, value, expiresAt, ...)

### アプリ独自

- `todos` (id, user_id, title, description, done, due_date, created_at, updated_at, **deleted_at**)
  - soft delete 対応 (`deleted_at IS NULL` で絞り込み)
  - `user_id` で所有権を持ち、他人の todo には触れない

## API エンドポイント (初期)

| Method | Path                      | 説明                                                                                                                                                 |
| ------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/`                       | ランディングページ (Hono JSX、人間向け)。サーバー稼働状況・DB接続状態・各種リンク (`/docs`, `/openapi.json`, `/api/auth/*`) と簡単な利用ガイドを表示 |
| GET    | `/health`                 | ヘルスチェック (JSON、機械/curl 向け)。`{ status, db }` を返す                                                                                       |
| GET    | `/docs`                   | Swagger UI                                                                                                                                           |
| GET    | `/openapi.json`           | OpenAPI スキーマ                                                                                                                                     |
| POST   | `/api/auth/sign-up/email` | Better Auth (メール登録)                                                                                                                             |
| POST   | `/api/auth/sign-in/email` | Better Auth (ログイン)                                                                                                                               |
| POST   | `/api/auth/sign-out`      | Better Auth (ログアウト)                                                                                                                             |
| GET    | `/api/auth/session`       | Better Auth (セッション取得)                                                                                                                         |
| `*`    | `/api/auth/**`            | Better Auth その他 (OAuth, JWT 等)                                                                                                                   |
| GET    | `/api/todos`              | 一覧 (cursor pagination、filter: `done`, sort: `due_date,-created_at`, `limit`/`cursor`)                                                             |
| GET    | `/api/todos/page/:n`      | 一覧 (offset pagination、`size`/`done`/`sort` クエリ、`{ items, page, size, total, hasNext, hasPrev }`)                                              |
| POST   | `/api/todos`              | 作成                                                                                                                                                 |
| GET    | `/api/todos/:id`          | 取得                                                                                                                                                 |
| PATCH  | `/api/todos/:id`          | 更新                                                                                                                                                 |
| DELETE | `/api/todos/:id`          | soft delete                                                                                                                                          |

## 認証方式 (フロント側の選択肢)

Better Auth プラグインで以下を**同時提供**:

1. **Cookie セッション** (デフォルト) — SSR 系フロント (Next.js RSC 等) 向け
2. **JWT** (`jwt` プラグイン) — TanStack Start, SPA, モバイル向け
3. **Bearer トークン** (`bearer` プラグイン) — `Authorization: Bearer <token>` で叩きたい場合
4. **OAuth** (`socialProviders` 設定) — Google / GitHub 等 (env でクライアント ID/Secret を渡したものだけ有効化)

## 開発コマンド (想定)

```bash
pnpm install
pnpm db:migrate         # マイグレーション適用
pnpm db:seed            # シードデータ投入 (demo user → todos 3 件)
pnpm db:seed:user       # demo user のみ作成 (Better Auth signUpEmail、冪等)
pnpm db:seed:todos -- --user-id=<id> [--count=3]  # 指定 user に todos を追加 (毎回追加)
pnpm db:reset           # DB ファイル削除 → migrate → seed
pnpm dev                # 開発サーバー (HMR)
pnpm test               # Vitest
pnpm lint               # oxlint (設定: .oxlintrc.json / correctness=error, suspicious|perf=warn)
pnpm format             # oxfmt (設定: .oxfmtrc.json / singleQuote + sortImports 有効)
pnpm format:check       # oxfmt --check (差分があれば非ゼロ exit、CI 用)
pnpm build              # 型チェックのみ (tsc --noEmit)。実行は tsx 経由
docker compose up       # コンテナで起動
```

## 環境変数

`.env.example` を整備し、`src/env.ts` で Zod スキーマで検証する。

```
PORT=8931
DATABASE_URL=file:./data/app.db
BETTER_AUTH_SECRET=...          # openssl rand -base64 32
BETTER_AUTH_URL=http://localhost:8931
CORS_ORIGIN=*                   # dev はワイルドカード、本番はカンマ区切り
GOOGLE_CLIENT_ID=               # 空なら OAuth プロバイダ無効
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

## ポート

- API サーバー: `8931` (白菜 = は (8) く (9) さ (3) い (1)。Next.js / Vite / TanStack Start 等のデフォルトポートと完全に被らない)

## 作業時のルール (Claude 向け)

- いきなり実装に入らず、調査・方針決めを経てから手を動かす
- 場当たり的な実装はしない。根本原因を考える
- 公式ドキュメント (Hono / Better Auth / Drizzle) を参照し、推測でコードを書かない
- 敬語で対話する
- ルーター定義の chainable 規約を破らない (RPC 型推論が壊れるため)
- ハンドラをルーター定義ファイルの外に切り出さない (必要なら `factory.createHandlers()`)
- `c.notFound()` を使わない。`c.json({...}, 404)` を使う
- `tsconfig.json` の `strict: true` を維持する
- 認証ロジックを自前で書かない (Better Auth に存在する機能ならそれを使う)
- API 仕様を変更するときは Zod スキーマから直す
