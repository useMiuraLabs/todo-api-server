#!/usr/bin/env bash
# todo-api-server: Docker 用セットアップ (冪等)
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

echo "==> Docker daemon を確認します"
if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker が動いていません。Docker Desktop を起動してください" >&2
  exit 1
fi

echo "==> docker compose up -d --build"
docker compose up -d --build

echo "==> ヘルスチェックを待ちます (最大 30 秒)"
HEALTH_URL="http://localhost:8931/health"
ATTEMPTS=30
i=0
until curl -fs "$HEALTH_URL" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge "$ATTEMPTS" ]; then
    echo "ERROR: ヘルスチェックがタイムアウトしました ($HEALTH_URL)" >&2
    echo "       docker compose logs api でログを確認してください" >&2
    exit 1
  fi
  sleep 1
done

cat <<'EOF'

✅ Docker is up!

Open: http://localhost:8931
Docs: http://localhost:8931/docs

Stop:    docker compose stop
Logs:    docker compose logs -f api
Down:    docker compose down
EOF
