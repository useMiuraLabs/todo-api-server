#!/usr/bin/env bash
# todo-api-server: ローカル開発用セットアップ (冪等)
set -euo pipefail

cd "$(dirname "$0")/.."

DEFAULT_SECRET="change-me-to-a-random-32-byte-base64-string"

echo "==> .env を確認します"
if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    echo "ERROR: .env.example が見つかりません" >&2
    exit 1
  fi
  cp .env.example .env
  echo "    .env.example から .env を作成しました"
else
  echo "    .env は既に存在します (保持)"
fi

echo "==> BETTER_AUTH_SECRET を確認します"
CURRENT_SECRET="$(grep -E '^BETTER_AUTH_SECRET=' .env | sed -E 's/^BETTER_AUTH_SECRET=//' || true)"
if [ -z "$CURRENT_SECRET" ] || [ "$CURRENT_SECRET" = "$DEFAULT_SECRET" ]; then
  if ! command -v openssl >/dev/null 2>&1; then
    echo "ERROR: openssl が必要です" >&2
    exit 1
  fi
  NEW_SECRET="$(openssl rand -base64 32)"
  # macOS sed / GNU sed の差異を避けるため awk + 一時ファイル経由で書き換える。
  TMP_FILE="$(mktemp)"
  awk -v secret="$NEW_SECRET" '
    BEGIN { replaced = 0 }
    /^BETTER_AUTH_SECRET=/ { print "BETTER_AUTH_SECRET=" secret; replaced = 1; next }
    { print }
    END {
      if (!replaced) print "BETTER_AUTH_SECRET=" secret
    }
  ' .env > "$TMP_FILE"
  mv "$TMP_FILE" .env
  echo "    BETTER_AUTH_SECRET を自動生成しました"
else
  echo "    BETTER_AUTH_SECRET は独自値が設定済みです (保持)"
fi

echo "==> pnpm install"
pnpm install

echo "==> DB を準備します"
mkdir -p data
if [ ! -f data/app.db ]; then
  echo "    DB が存在しないため初期化します (migrate + seed)"
  pnpm db:reset
else
  echo "    DB が存在するため差分マイグレーションのみ実行します"
  pnpm db:migrate
fi

cat <<'EOF'

✅ Setup complete!

Next steps:
  pnpm dev      # 開発サーバー起動 (http://localhost:8931)
  pnpm test     # テスト実行
  pnpm db:reset # DB を初期化
EOF
