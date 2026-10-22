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
    launchOptions: {
      ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
      // Headless hosts without a GPU still exercise the real WebGL renderer.
      ...(process.env.PW_SOFTWARE_WEBGL === '1' ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } : {}),
    },
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
