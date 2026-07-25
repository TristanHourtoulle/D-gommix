import { defineConfig } from '@playwright/test'

export const DATABASE_URL = 'postgres://degommix:degommix@localhost:54329/degommix_test'
export const WEB_URL = 'http://localhost:3000'
export const WS_URL = 'http://localhost:4001'

/** ≥ 32 chars keeps the Better Auth entropy warnings out of the logs. */
const BETTER_AUTH_SECRET = 'e2e-secret-0123456789-abcdefghijklmn'

export default defineConfig({
  testDir: '.',
  timeout: 240_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: WEB_URL,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command:
        'pnpm --filter @degommix/db db:migrate && pnpm --filter @degommix/ws-server exec tsx src/index.ts',
      url: `${WS_URL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: '..',
      env: {
        DATABASE_URL,
        WEB_ORIGIN: WEB_URL,
        PORT: '4001',
      },
    },
    {
      command: 'pnpm --filter @degommix/web build && pnpm --filter @degommix/web start',
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 420_000,
      cwd: '..',
      env: {
        DATABASE_URL,
        BETTER_AUTH_URL: WEB_URL,
        BETTER_AUTH_SECRET,
        NEXT_PUBLIC_WS_URL: WS_URL,
      },
    },
  ],
})
