/* CommonJS on purpose: loading an ESM spec through Playwright's esmLoaderHost hangs
   with no output on this machine (Windows, "type": "module", path with spaces).
   Plain require() skips that loader entirely. */
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

/* axe on every route. Critical and serious both fail: this app is small enough that letting
   "serious" through would only be a way of not fixing things. */

const ROUTES = ['menu', 'feed', 'jobs', 'hacks', 'news', 'more', 'notes', 'cal', 'apps', 'opts', 'desk', 'wall', 'credits'];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await new Promise(res => {
      const q = indexedDB.deleteDatabase('arcade');
      q.onsuccess = q.onerror = q.onblocked = res;
    });
  });
  await page.goto('/#/desk');
  await page.waitForSelector('#page');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' })));
  await page.waitForTimeout(300);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' })));
  await page.waitForTimeout(900);
  const tour = page.locator('.tour button');
  if (await tour.count()) await tour.first().click();
});

for (const route of ROUTES) {
  test(`axe: /#/${route}`, async ({ page }) => {
    await page.goto('/#/' + route);
    await page.waitForTimeout(700);
    const results = await new AxeBuilder({ page }).analyze();
    const bad = results.violations.filter(v => ['critical', 'serious'].includes(v.impact));
    if (bad.length) {
      console.log(route, JSON.stringify(bad.map(v => ({
        id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 2).map(n => n.html.slice(0, 90))
      })), null, 1));
    }
    expect(bad.map(v => `${v.impact}: ${v.id}`)).toEqual([]);
  });
}

test('every interactive element is reachable by keyboard and has a name', async ({ page }) => {
  for (const route of ROUTES) {
    await page.goto('/#/' + route);
    await page.waitForTimeout(500);
    const bad = await page.$$eval('#page button, #page a[href], #page input, #page select, #page textarea',
      els => els.filter(e => {
        const name = (e.textContent || '').trim() || e.getAttribute('aria-label')
          || e.getAttribute('title') || e.placeholder || e.id;
        return e.tabIndex < 0 || !name;
      }).map(e => e.tagName + '.' + e.className));
    expect(bad, `on /#/${route}`).toEqual([]);
  }
});
