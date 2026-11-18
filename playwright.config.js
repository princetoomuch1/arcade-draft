import { defineConfig, devices } from '@playwright/test';

/* One browser, one worker: these tests share a dev server and an IndexedDB, and a flaky suite
   that passes on a retry is worse than no suite at all. */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1280, height: 820 },
    ...devices['Desktop Chrome']
  },
  webServer: {
    command: 'node tools/serve.mjs',
    url: 'http://127.0.0.1:5174',
    env: { PORT: '5174' },
    reuseExistingServer: true,
    timeout: 20000
  }
});
