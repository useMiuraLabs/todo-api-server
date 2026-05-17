---
name: setup
description: todo-api-server リポジトリの初期セットアップを最後まで走らせ、何が起きたか・何が使えるようになったか・どう確認するかを日本語で説明する。ユーザーが `/setup` と打ったとき、または「セットアップ」「初期化」「最初から動かしたい」「起動できる状態にして」「環境構築」「サーバー立てて」等を口にしたとき、または clone 直後で何をすべきか聞かれたときは必ずこの skill を使う。手順を口頭で羅列するのではなく、実際にコマンドを実行して動作確認までやり切る skill。
---

# /setup — todo-api-server 初期セットアップ skill

このリポジトリ (todo-api-server) を「何もない状態」から「動いていて叩ける状態」まで持っていく一連の作業を、ユーザーに代わって完走する skill です。完走するだけでなく、最後に**何をしたのか / 何ができるようになったのか / どう確認すればいいのか**を日本語で丁寧に説明します。

## なぜこの skill があるか

このプロジェクトは「フロントエンド学習用の使い回せる Todo API」として作られています。3 ヶ月後の自分が clone してきて「これどうやって起動するんだっけ?」となったときに、`/setup` 1 発で迷いなく動かせるようにするのが目的です。

`pnpm run setup` / `pnpm run setup:docker` という shell スクリプトは既にあるので、この skill は**スクリプトを呼ぶオーケストレータ + ユーザーへの説明係**として機能します。

## フロー

### Step 1. 起動方法を確認する

`AskUserQuestion` で以下を聞きます:

```
質問: どちらの環境でセットアップしますか?
ヘッダー: 起動方法
選択肢:
  - "ローカル": Node.js + tsx で直接起動 (開発しながら触るならこちら)
  - "Docker": docker compose で起動 (環境を汚したくない / 永続性試したいならこちら)
```

### Step 2. setup スクリプトを実行する

#### ローカルの場合

```bash
pnpm run setup
```

※ 必ず `pnpm run setup` の形で。`pnpm setup` (run なし) は pnpm 組み込みコマンドと衝突します。

その後、開発サーバーを **background** で起動して動作確認します:

```bash
pnpm dev  # run_in_background=true で起動
```

起動には 1〜2 秒かかるので、`Monitor` で "Listening" 等のログが出るのを待つか、curl のリトライで待ちます。

#### Docker の場合

```bash
pnpm run setup:docker
```

このスクリプトは中で `docker compose up -d --build` → `/health` リトライまで全部やります。完走したら次の Step へ。

### Step 3. ヘルスチェックで動作確認

```bash
curl -fs http://localhost:8931/health
```

期待値: `{"status":"ok","db":"ok"}`

失敗したら原因を切り分けます (Docker daemon が落ちている / port 8931 が既に使われている / .env の SECRET が無効 等)。

### Step 4. シードデータ確認 (任意、軽く)

setup スクリプトは初回なら `db:reset` (migrate + seed) を走らせ、既存 DB があれば `db:migrate` だけ走らせます。seed されているかは以下で確認可能:

```bash
curl -s http://localhost:8931/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"???"}'
```

ただし demo user は seed 時にパスワードを設定していないので、確認は省略してよい場合が多いです。`pnpm db:seed` を別途叩いて「seed done. demo-user todos = 3」が出ることを確認するのがシンプルです。

### Step 5. ユーザーへの完了報告

以下の **3 部構成** で日本語で報告します。markdown 整形で。

#### 1. やったこと

- 実行したコマンド (`pnpm run setup` / `pnpm run setup:docker`)
- 生成/更新されたファイル (`.env`, `data/app.db`, Docker コンテナ等)
- 既存環境を尊重した点 (`.env` 既存なら触っていない、等)

#### 2. できるようになったこと

URL の表で:
| URL | 用途 |
|---|---|
| http://localhost:8931 | ランディングページ (人間向け、稼働状況 + リンク) |
| http://localhost:8931/docs | Swagger UI (ブラウザから全 API を叩ける) |
| http://localhost:8931/openapi.json | OpenAPI スキーマ (フロントの型生成用) |
| http://localhost:8931/health | JSON ヘルスチェック |
| http://localhost:8931/api/auth/\*\* | Better Auth (signup/signin/session 等) |
| http://localhost:8931/api/todos | Todo CRUD |

#### 3. どう確認するか

3 段階で提示:

1. **ブラウザで開く** — http://localhost:8931 と http://localhost:8931/docs を開いて、見え方を確認
2. **Swagger UI から叩く** — /docs で `POST /api/auth/sign-up/email` → `POST /api/todos` → `GET /api/todos` の順に Execute
3. **curl で叩く** (好みで) — 以下のサンプルを提示

   ```bash
   # signup
   curl -X POST http://localhost:8931/api/auth/sign-up/email \
     -H "Content-Type: application/json" \
     -c cookies.txt \
     -d '{"email":"me@example.com","password":"password123","name":"Me"}'

   # todo 作成 (cookie で認証)
   curl -X POST http://localhost:8931/api/todos \
     -H "Content-Type: application/json" \
     -b cookies.txt \
     -d '{"title":"first todo"}'

   # 一覧
   curl -b cookies.txt http://localhost:8931/api/todos
   ```

最後に「次に何かやりたいことがあれば `/auth-guide` で認証の仕組みを聞けます」と案内すると親切です。

## 注意事項

### `pnpm setup` ではなく `pnpm run setup`

**必ず `run` を付ける**。`pnpm setup` は pnpm の組み込みコマンド (PATH 設定用) で、まったく別の動作をします。誤って打たないようコマンド提示時に注意。

### 背景プロセスの扱い (ローカルのみ)

`pnpm dev` を background で起動した場合、skill 終了後もプロセスは残ります。ユーザーに以下を明示:

- 停止方法: 「ターミナルで `lsof -ti:8931 | xargs kill` または `pkill -f 'tsx.*serve.ts'`」
- skill が起動した tsx プロセスは PID で覚えておいて報告してもよい

Docker の場合は `docker compose stop` / `docker compose down` を案内。

### Docker daemon が動いていないケース

`pnpm run setup:docker` 内で `docker info` チェックがあり、daemon 未起動なら明示エラーで止まります。その場合は「Docker Desktop を起動してから再実行してください」と案内。

### Port 8931 衝突

既に何かが 8931 を listen している場合、起動失敗します。`lsof -i :8931` で原因プロセスを特定して報告。

### BETTER_AUTH_SECRET の自動生成

setup スクリプトは `.env` の SECRET がデフォルト値のままなら `openssl rand -base64 32` で生成して書き換えます。ユーザーが既に独自値を入れている場合は触りません。

## 関連ドキュメント

- README.md: クイックスタートと API 全体像
- CLAUDE.md: 設計思想と公式準拠ルール
- 公式: https://hono.dev / https://better-auth.com/docs / https://orm.drizzle.team
