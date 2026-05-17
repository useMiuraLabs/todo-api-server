#!/bin/sh
set -e

export PATH="/app/node_modules/.bin:$PATH"

echo "[entrypoint] running migrations..."
tsx /app/src/db/migrate.ts
echo "[entrypoint] migrations done. starting: $*"

exec "$@"
