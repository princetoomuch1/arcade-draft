/* CommonJS on purpose. An ESM config in a "type": "module" package sends Playwright down a
   config-reload path that hangs on this machine (Windows, path with spaces) with no output at all.
   A .cjs config skips that path. The spec files are .cjs for the same reason. */
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
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
