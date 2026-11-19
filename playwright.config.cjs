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
  /* Baselines are committed, one folder for all of them, named by route and size rather than by
     which spec file happened to take the picture. */
  snapshotPathTemplate: 'e2e/__screenshots__/{platform}/{arg}{ext}',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    ...devices['Desktop Chrome']
  },
  /* Two projects, because the app has two shapes. Everything is desktop-only by decision except
     the share view, which a recipient opens on a phone from a message — so the tests tagged
     @mobile, and only those, run at 375x667. */
  projects: [
    {
      name: 'desktop',
      grepInvert: /@mobile/,
      use: { viewport: { width: 1280, height: 820 } }
    },
    {
      name: 'mobile',
      grep: /@mobile/,
      use: { viewport: { width: 375, height: 667 } }
    }
  ],
  webServer: {
    command: 'node tools/serve.mjs',
    url: 'http://127.0.0.1:5174',
    env: { PORT: '5174' },
    reuseExistingServer: true,
    timeout: 20000
  }
});
