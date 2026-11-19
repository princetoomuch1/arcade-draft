/* Visual regression.
 *
 * The point of this file is that nobody should have to report "the text is overlapping" again.
 * A baseline image per route per size, and any later change that moves pixels has to be looked at
 * and either accepted (`--update-snapshots`) or fixed.
 *
 * Three things make the shots deterministic, and all three are needed:
 *   - a fixed clock, because the cards print "2D AGO" from the seed timestamps and that drifts
 *     every day otherwise;
 *   - reduced motion, which stops the CSS keyframes AND the hamster's blink and run timers;
 *   - a wiped database, so no leftover from another test is in the picture.
 */
const { test, expect } = require('@playwright/test');
const { fresh, enter } = require('./app.cjs');

const ROUTES = ['menu', 'feed', 'jobs', 'hacks', 'news', 'more', 'notes', 'cal', 'apps', 'opts',
  'desk', 'wall', 'credits'];

/* A moment shortly after the seed data was generated, so every "ago" is a fixed string. */
const FROZEN = new Date('2026-11-20T09:00:00.000Z');

/* Baselines are per-platform, and only the Windows set exists so far: these were recorded on the
   machine this was built on. On another platform the first run would compare Windows text
   rendering against Linux text rendering and fail 26 times for a reason that is not a bug.
   Record a set there with `npx playwright test e2e/regression.spec.cjs --update-snapshots` and
   commit `e2e/__screenshots__/<platform>/`, and this skip lifts itself. */
const fs = require('node:fs');
const path = require('node:path');
const HAVE_BASELINES = fs.existsSync(path.join(__dirname, '__screenshots__', process.platform));

const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 667 }
];

for (const size of SIZES) {
  test.describe(size.name, () => {
    for (const r of ROUTES) {
      test(`${r} looks the way it was last agreed to look`, async ({ page }) => {
        test.skip(!HAVE_BASELINES,
          `no baselines recorded for ${process.platform} yet — run with --update-snapshots here`);
        /* emulateMedia, not test.use({reducedMotion}): the fixture did not reach the page here,
           and the news ticker kept scrolling, so no two screenshots were ever the same. */
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.clock.setFixedTime(FROZEN);
        /* Always boot at desktop size. Below 900x560 the app shows its RESIZE THE WINDOW card,
           which would swallow the one-time tour and leave every mobile baseline stuck on the
           onboarding screen. Shrinking afterwards is also what a person actually does. */
        await page.setViewportSize({ width: 1440, height: 900 });
        await fresh(page);
        await page.clock.setFixedTime(FROZEN);
        await enter(page, r);

        if (size.name !== 'desktop') {
          await page.setViewportSize({ width: size.width, height: size.height });
          await page.goto('/#/' + r);
          await page.waitForTimeout(500);
        }
        await page.waitForTimeout(600);

        await expect(page).toHaveScreenshot(`${r}-${size.name}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,     // 0.1%
          animations: 'disabled',
          caret: 'hide'
        });
      });
    }
  });
}
