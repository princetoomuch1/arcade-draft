/* The screenshot loop.
 *
 * Not a test. A camera. It walks every route at both sizes and writes a full-page PNG, so the
 * app can be LOOKED AT rather than inferred from a passing assertion. Green checks said this app
 * was fine while a person opened it and found overlapping text and an empty table.
 *
 * Run: npx playwright test e2e/shots.spec.cjs --project=desktop
 * Output: screenshots/<route>-<size>.png  (gitignored; the regression baselines are separate)
 */
const { test } = require('@playwright/test');
const { fresh, enter } = require('./app.cjs');

const ROUTES = ['menu', 'feed', 'jobs', 'hacks', 'news', 'more', 'notes', 'cal', 'apps', 'opts',
  'desk', 'wall', 'credits'];

const TAG = process.env.SHOT_TAG || 'now';

test('capture every route', async ({ page }) => {
  test.setTimeout(240000);
  await fresh(page);
  await enter(page, 'desk');

  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('pageerror', e => problems.push(`pageerror: ${e}`));

  for (const size of [{ w: 1440, h: 900, name: 'desktop' }, { w: 375, h: 667, name: 'mobile' }]) {
    await page.setViewportSize({ width: size.w, height: size.h });
    for (const r of ROUTES) {
      await page.goto('/#/' + r);
      await page.waitForTimeout(800);
      await page.screenshot({
        path: `screenshots/${TAG}/${r}-${size.name}.png`,
        fullPage: true
      });
    }
  }
  if (problems.length) console.log('CONSOLE PROBLEMS:\n' + problems.join('\n'));
});
