import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    // Domain tests are pure and need no environment. Database-backed API
    // tests added in phase 2 opt into their own setup.
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    globalSetup: ['./tests/globalSetup.ts'],
    // Integration tests share one SQLite file and reseed between tests, so
    // they must not run concurrently with each other.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
