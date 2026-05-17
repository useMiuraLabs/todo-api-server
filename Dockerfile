# syntax=docker/dockerfile:1.7

# Single-stage: tsx で本番も .ts を直接実行する方針 (本番運用想定なし)
FROM node:22-bookworm-slim

# better-sqlite3 の prebuilt が無い環境向けにビルドツールを入れておく
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME=/root/.local/share/pnpm
ENV PATH=/app/node_modules/.bin:$PNPM_HOME:$PATH
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app

# 依存解決 (tsx は dependencies 側にあるため --prod でも入る)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ソースとマイグレーション
COPY src ./src
COPY drizzle ./drizzle
COPY drizzle.config.ts tsconfig.json ./
COPY bin/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh \
  && mkdir -p /app/data \
  && chown -R node:node /app

USER node

EXPOSE 8931

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["tsx", "src/bin/serve.ts"]
