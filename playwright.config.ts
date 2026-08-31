import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

/**
 * One connected journey, run in a real browser.
 *
 * The nine other required checks are fast unit and integration tests. This
 * suite exists to prove the hand-offs between the three interfaces, which is
 * the thing unit tests structurally cannot show.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  // Reuses a server you already have running; starts one otherwise.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000/api/session',
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
