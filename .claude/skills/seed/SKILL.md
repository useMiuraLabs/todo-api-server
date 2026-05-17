---
name: seed
description: todo-api-server リポジトリの DB に seed データ (demo user / todos) を投入する skill。ユーザーが「seed して」「シード入れて」「デモデータ入れて」「todos 適当に追加して」「DB に何か入れて」「/seed」等の **実行を要求する** 発言をしたとき、または既存 user に todos を追加したい意図を示したときに必ず使う。3 モード (demo user 作成 / 指定 user に todos 追加 / 両方) を AskUserQuestion で選ばせて実行し、結果を日本語で報告する。注意: 「seed.ts どうなってる」「seed の実装変えたい」「シードってどう動く」のような **コード/設計の質問** にはこの skill を使わない (普通の調査・実装タスクとして扱う)。
---

# /seed — todo-api-server DB seed 投入 skill

このリポジトリ (todo-api-server) の DB に seed データを投入する作業を、ユーザーに代わって最後まで完走する skill です。何を seed するか (demo user / todos / 両方) をまず確認し、必要なら対象 user・件数まで対話で詰めた上で実行し、結果を日本語で報告します。

## なぜこの skill があるか

このプロジェクトには `pnpm db:seed` / `pnpm db:seed:user` / `pnpm db:seed:todos` の 3 種類の seed コマンドがあり、用途と引数が異なります。「適当に入れて」と言われたときに、ユーザーが何を求めているかを 1 度の問いかけで切り分け、`--user-id` 等の引数指定までこの skill 側で面倒を見るのが目的です。

実 script は `src/db/seed*.ts` にあるので、この skill は**スクリプトを呼ぶオーケストレータ + 対話 UI + 報告係**として機能します。

## フロー

### Step 1. 何を seed するか聞く

`AskUserQuestion` で以下を聞きます:

```
質問: 何を seed しますか?
ヘッダー: モード
multiSelect: false
選択肢:
  - "demo user を作る": pnpm db:seed:user。Better Auth 経由で demo@example.com / password123 のユーザーを冪等作成
  - "既存 user に todos を追加": pnpm db:seed:todos -- --user-id=<id> --count=N。実在 user を一覧から選ばせる
  - "両方 (デフォルト seed)": pnpm db:seed。demo user 作成 + その user に todos 3 件
```

### Step 2-A. demo user モード

```bash
pnpm db:seed:user
```

script の出力 (`created user id=...` / `already exists id=...` 等) から user id を拾い、ユーザーに報告します。

### Step 2-B. 既存 user に todos モード

#### 1. 実在 user 一覧を取得

```bash
sqlite3 data/app.db "SELECT id, email FROM user ORDER BY createdAt"
```

`sqlite3` コマンドが入っていない環境なら、以下のいずれかで代替します:

- `pnpm db:studio` をブラウザで開いて user テーブルを見るよう案内
- Drizzle で直接クエリする tsx ワンライナーを実行 (例: `pnpm tsx -e "import {db} from './src/db'; import {user} from './src/db/auth-schema'; db.select().from(user).all().then(console.log)"`)

#### 2. AskUserQuestion で user を選ばせる

取得した user のリストを選択肢に変換します:

- label は `email (id 先頭 8 文字)` (例: `demo@example.com (a1b2c3d4)`)
- description は full id

```
質問: どの user に todos を追加しますか?
ヘッダー: 対象 user
multiSelect: false
選択肢: (取得した user, 最大 4 件)
```

制限事項:

- 最大 4 件まで。それ以上 user がいる場合は 3 件 + 「他多数 (id を直接指定)」を Other 入力に誘導
- 0 件なら「user がいません。先に `demo user を作る` を実行してください」と案内して終了

#### 3. 件数を聞く

```
質問: 何件 todos を追加しますか?
ヘッダー: 件数
multiSelect: false
選択肢:
  - "3": 軽くデモする最小件数
  - "10": 一覧表示の動作確認向け
  - "50": ページング・スクロールの動作確認向け
  - "Other": 任意の件数を直接入力
```

#### 4. 実行

```bash
pnpm db:seed:todos -- --user-id=<id> --count=<n>
```

### Step 2-C. 両方モード

```bash
pnpm db:seed
```

このコマンドが内部で demo user 作成 → その user に todos 3 件追加までやってくれます。

### Step 3. 結果報告

以下の **3 部構成** で日本語で報告します。markdown 整形で。

#### 1. 実行コマンド

コードブロックで提示。

```bash
pnpm db:seed:todos -- --user-id=xxxxxxxx-... --count=10
```

#### 2. 結果

script の出力から拾って、以下のような表で:

| 項目            | 値                      |
| --------------- | ----------------------- |
| 作成件数        | 10 件 (todos)           |
| 対象 user id    | xxxxxxxx-...            |
| 対象 user email | demo@example.com        |
| 備考            | 既存 user に追加 (累積) |

#### 3. 確認方法

- **Drizzle Studio**: `pnpm db:studio` でブラウザから DB 確認
- **login 試行** (demo user なら):
  ```bash
  curl -X POST http://localhost:8931/api/auth/sign-in/email \
    -H "Content-Type: application/json" \
    -c cookies.txt \
    -d '{"email":"demo@example.com","password":"password123"}'
  ```
- **一覧取得** (サーバー起動中なら):
  ```bash
  curl -b cookies.txt http://localhost:8931/api/todos
  ```

## 注意事項

### `pnpm db:seed:todos -- --user-id=...` の `--` は必須

pnpm は `--` の前を pnpm 自身の引数、後を script への引数として渡します。`--` を省くと `--user-id` が pnpm に食われて script に届きません。**コマンド提示時に必ず `--` を入れる**こと。

### 冪等性の違い

- **demo user 作成**: 冪等。既存なら作成スキップして既存 id を返す
- **todos 追加**: 毎回追加 (累積)。10 件を 3 回叩けば 30 件になる

「リセットしたい」と言われたら seed ではなく `pnpm db:reset` (migrate + seed やり直し) を案内する。

### AUTH_DISABLED モードの `demo-user-id` と seed:user の demo user は別物

- `src/auth/middleware.ts` の AUTH_DISABLED モードは固定文字列 `id='demo-user-id'` の user を使う
- `pnpm db:seed:user` で作る demo@example.com は UUID の id を持つ別ユーザー

両者は用途が違います (AUTH_DISABLED は認証バイパス用、seed:user は本物の Better Auth 経由ログイン用)。**ユーザーが「demo user」と言ったときどちらを指しているか曖昧なら確認する**。

### 既存サーバーが立っていても再起動不要

seed:user は Better Auth の API をプログラマティックに呼ぶだけで、内部的には DB に直接書き込みます。dev サーバーや Docker コンテナが起動していても、停止・再起動は不要です。

### sqlite3 コマンドが無い場合

macOS なら標準で入っていますが、Linux/Docker 環境では入っていないことがあります。`which sqlite3` で確認し、無ければ Drizzle Studio (`pnpm db:studio`) か tsx ワンライナーで user 一覧を取得します。

## 関連ドキュメント

- README.md の「DB 運用」セクション
- `src/db/seed-user.ts` — demo user 作成の実装 (Better Auth 経由)
- `src/db/seed-todos.ts` — todos 追加の実装 (引数パース)
- `src/db/seed.ts` — 両方を順に呼ぶデフォルト seed
- 公式: https://orm.drizzle.team / https://better-auth.com/docs
