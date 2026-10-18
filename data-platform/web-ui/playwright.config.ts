import { defineConfig } from '@playwright/test';

// Browser journeys run against the real Vite app with a deferred/mocked API (see tests/e2e/helpers.ts).
// PW_CHROMIUM may point at an already installed Chromium; otherwise Playwright's own browser is used.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 45_000,
  projects: [{name:'ui',testIgnore:/real-api\.spec\.ts/},...(process.env.V33_API_TARGET ? [{name:'api',testMatch:/real-api\.spec\.ts/}] : [])],
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
