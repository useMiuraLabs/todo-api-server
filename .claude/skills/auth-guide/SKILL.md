---
name: auth-guide
description: todo-api-server プロジェクトの認証 (Better Auth) を対話的に解説する skill。提供している 4 つの認証方式 (Cookie セッション / JWT / Bearer / OAuth) + AUTH_DISABLED モード、フロント別 (Next.js RSC / SPA / モバイル) の呼び出し方、curl での試し方、Better Auth が管理するテーブル (user / session / account / verification / jwks) の役割を、ユーザーが聞きたいトピックに絞って説明する。ユーザーが `/auth-guide` と打ったとき、または「auth どうなってるの」「認証の仕組み教えて」「signup どうやる」「JWT どう使う」「OAuth 設定したい」「セッションはどこに保存される」「AUTH_DISABLED って何」「フロントからどう叩く」等を聞いたら必ずこの skill を使う。一気に全部出さず、最初に何を知りたいかを聞いてからピンポイントで答えるのが特徴。
---

# /auth-guide — todo-api-server 認証ガイド skill

このプロジェクト固有の認証 (Better Auth) について、**ユーザーが聞きたいことだけ**を対話的に説明する skill です。全部一気に出すと圧縮された情報量で疲れるので、最初に「何を知りたい?」を聞いて、選ばれたトピックだけ深掘りします。

## なぜこの skill があるか

このプロジェクトは複数の認証方式 (Cookie / JWT / Bearer / OAuth) を 1 サーバーに同居させる珍しい構成で、しかも Better Auth + Drizzle + Hono の組み合わせは公式ドキュメントも分散しています。3 ヶ月後の自分や、新しいフロントを始めるときに「あれどう叩くんだっけ」となったときの参照点として機能させます。

## フロー

### Step 1. 何を知りたいか聞く

`AskUserQuestion` で以下を聞きます (multi-select OK):

```
質問: 何を知りたいですか? (複数選択可)
ヘッダー: トピック
multiSelect: true
選択肢:
  - "全体像": 4 つの認証方式の使い分け / どれを選べばいいか
  - "curl で試す": signup → signin → session → signout の curl サンプル
  - "フロント実装例": Next.js / SPA / モバイル各々の呼び出し方
  - "JWT / Bearer の使い方": トークン取得とヘッダ送付
  - "OAuth 設定": Google / GitHub の有効化手順
  - "AUTH_DISABLED": 認証をバイパスする demo モード
  - "DB スキーマ": user / session / account / verification / jwks の役割
```

### Step 2. 選ばれたトピックを順に説明

以下の各セクションから該当部分を抜粋して、markdown で出力します。

---

## トピック詳細

### 全体像 — 4 つの認証方式の使い分け

このサーバーは Better Auth 1 つで以下を**同時に**提供しています:

| 方式              | プラグイン           | 主な用途                                         | フロントの典型例                |
| ----------------- | -------------------- | ------------------------------------------------ | ------------------------------- |
| Cookie セッション | デフォルト           | SSR フロント                                     | Next.js (App Router, RSC)       |
| JWT               | `jwt()`              | SPA・トークンを明示的に持ちたい                  | TanStack Start, Vite SPA        |
| Bearer            | `bearer()`           | `Authorization: Bearer <token>` ヘッダで叩きたい | モバイル, curl, Postman         |
| OAuth             | `socialProviders`    | ソーシャルログイン                               | どのフロントでも (env で有効化) |
| (バイパス)        | `AUTH_DISABLED=true` | デモ / 認証考えずに UI 試す                      | 学習初期の素振り                |

**選び方の指針**:

- Web アプリ作るなら Cookie セッションが楽 (XSS リスクは小さく、CSRF 対策は Better Auth 側)
- React SPA で localStorage にトークン持ちたい派なら JWT
- モバイル / 外部から叩くなら Bearer
- AUTH_DISABLED は本物の認証を組む前の素振り用と割り切る

実装場所: `src/auth/index.ts`

公式: https://better-auth.com/docs

---

### curl で試す — signup → signin → session → signout

cookie を保存しながら一連を流すパターン:

```bash
# 1. signup
curl -X POST http://localhost:8931/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"me@example.com","password":"password123","name":"Me"}'

# 2. session 確認
curl http://localhost:8931/api/auth/get-session \
  -b cookies.txt

# 3. 別端末から signin (cookie を貼り直す)
curl -X POST http://localhost:8931/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"me@example.com","password":"password123"}'

# 4. signout
curl -X POST http://localhost:8931/api/auth/sign-out \
  -b cookies.txt
```

Bearer トークン版:

```bash
# signin で set-auth-token ヘッダが返る (bearer plugin 由来)
TOKEN=$(curl -si -X POST http://localhost:8931/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"me@example.com","password":"password123"}' \
  | grep -i '^set-auth-token:' | awk '{print $2}' | tr -d '\r')

curl http://localhost:8931/api/todos \
  -H "Authorization: Bearer $TOKEN"
```

---

### フロント実装例

#### Next.js (App Router / RSC, Cookie ベース)

```ts
// app/api/route handler や server action で:
const res = await fetch('http://localhost:8931/api/todos', {
  credentials: 'include', // Cookie を送る
  cache: 'no-store',
});
```

ブラウザからだと CORS の credentials 設定が必要。本サーバーは `CORS_ORIGIN` 環境変数で許可 origin を設定 (dev は `*`)。**Cookie を含めるなら `*` ではなく具体的な origin を書く必要あり** (CORS 仕様)。

#### Vite SPA / TanStack Start (JWT)

```ts
// signin で token を受け取り localStorage 等に保存
const { token } = await fetch('http://localhost:8931/api/auth/sign-in/email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json());

// 以降のリクエストに付与
fetch('http://localhost:8931/api/todos', {
  headers: { Authorization: `Bearer ${token}` },
});
```

#### React Native / モバイル (Bearer)

JWT と同じ。`Authorization: Bearer <token>` ヘッダで叩く。トークンは SecureStore / Keychain に保管。

#### 型を共有したい場合

- フロントが TS なら `openapi-typescript` で `http://localhost:8931/openapi.json` から型生成
- フロントが Hono を import してよいなら `src/client.ts` の `hc<AppType>` でフル型推論

---

### JWT / Bearer の使い方

#### トークン取得 (JWT)

```bash
curl http://localhost:8931/api/auth/token \
  -b cookies.txt
# → { token: "..." }
```

公式: https://better-auth.com/docs/plugins/jwt

#### Bearer 認証 (`bearer()` プラグイン)

- signin / signup のレスポンスに `set-auth-token` ヘッダが付く
- 以降は `Authorization: Bearer <token>` で叩けばサーバー側がセッション解決してくれる
- Cookie 不要のフロント (モバイル、curl、外部スクリプト) に最適

実装場所: `src/auth/index.ts` の `plugins: [jwt(), bearer()]`

公式: https://better-auth.com/docs/plugins/bearer

---

### OAuth 設定 (Google / GitHub)

`.env` に以下を設定すると有効化されます (両方揃わないとそのプロバイダは無効):

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

Better Auth のコールバック URL は `${BETTER_AUTH_URL}/api/auth/callback/<provider>` (例: `http://localhost:8931/api/auth/callback/google`)。これを各プロバイダの OAuth アプリ設定に登録。

実装場所: `src/auth/index.ts` で `socialProviders` を env に応じて条件付き構築。

ソーシャルログイン開始 URL: `GET /api/auth/sign-in/social?provider=google`

公式:

- https://better-auth.com/docs/authentication/google
- https://better-auth.com/docs/authentication/github

---

### AUTH_DISABLED — 認証をバイパスする demo モード

`.env` で `AUTH_DISABLED=true` にすると、`src/auth/middleware.ts` が以下を行います:

1. すべてのリクエストに固定 demo ユーザー (`id='demo-user-id'`) を注入
2. user テーブルに demo ユーザーが無ければ冪等に作成 (FK 制約のため必須)
3. requireAuth ミドルウェアも素通り

**何ができる**: signup / signin 不要で `/api/todos` 等が叩ける。フロント側で「認証どうしようかな」を後回しにして UI から作り始めたいときに便利。

**注意**: 全リクエストが同じ user 扱いになるので、複数アカウントの動作確認はできない。本物の認証を試したくなったら `AUTH_DISABLED=false` に戻す。

実装場所: `src/auth/middleware.ts`

---

### DB スキーマ — Better Auth 管理テーブルの役割

`@better-auth/cli generate` で自動生成された `src/db/auth-schema.ts` の 5 テーブル:

| テーブル       | 役割                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| `user`         | ユーザー本体 (id, name, email, emailVerified, image, createdAt, updatedAt)。アプリ側からは todos.user_id がここに FK |
| `session`      | Cookie セッション (token, expiresAt, ipAddress, userAgent, userId)。signin で作成、signout で削除                    |
| `account`      | OAuth プロバイダ別アカウント情報 / パスワードハッシュ。1 user が複数 provider を持てる (Google + GitHub 等)          |
| `verification` | メール確認・パスワードリセット用のトークン (identifier, value, expiresAt)                                            |
| `jwks`         | JWT 署名鍵 (publicKey, privateKey)。`jwt()` プラグインが使用                                                         |

**FK チェーン**:

- `session.userId → user.id` (cascade)
- `account.userId → user.id` (cascade)
- `todos.user_id → user.id` (cascade) ← アプリ独自

user を削除すると関連 session / account / todos も自動削除。

スキーマを直接見たいなら:

```bash
pnpm db:studio
# → ブラウザで Drizzle Studio が開く
```

公式: https://better-auth.com/docs/concepts/database

---

## 出力スタイル

- 1 トピックずつ markdown ブロックで返す
- コードブロックは必ず言語を明示 (`bash, `ts 等)
- 余計な前置きをせず、聞かれたことに直接答える
- 最後に「他のトピックも見ますか?」と聞いて、必要なら別トピックも続けて出す

## 関連

- CLAUDE.md の「認証戦略」セクション
- README.md の「認証」セクション
- `src/auth/index.ts`, `src/auth/middleware.ts`, `src/db/auth-schema.ts` (実装の真実はここ)
