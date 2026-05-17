import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    setupFiles: ['./tests/setup.ts'],
    // SQLite は同一ファイルへの並列書き込みで壊れるため、シリアル実行を強制する。
    pool: 'forks',
    isolate: false,
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
