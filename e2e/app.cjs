/* Shared setup for the e2e specs.
 *
 * CommonJS on purpose: loading an ESM spec through Playwright's esmLoaderHost hangs with no output
 * on this machine (Windows, "type": "module", path with spaces). Plain require() skips that loader.
 */

/** Wipe the database and the caches, and make sure the wipe has actually happened. */
async function fresh(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
    await new Promise(res => {
      const q = indexedDB.deleteDatabase('arcade');
      q.onsuccess = q.onerror = q.onblocked = res;
    });
  });
  /* That delete comes back BLOCKED: the running app is holding the connection open, so the
     database is only really dropped once this page goes away. Reload here, so the test starts
     from an empty store — otherwise the pending delete lands on the test's own first reload and
     silently wipes whatever the test seeded in between. */
  await page.reload();
  await page.waitForTimeout(400);
}

/** Start the app past the coin screen and the one-time tour, then land on a route. */
async function enter(page, route = 'desk') {
  await page.goto('/#/' + route);
  await page.waitForSelector('#page');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' })));
  await page.waitForTimeout(300);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' })));
  await page.waitForTimeout(900);
  const tour = page.locator('.tour button');
  if (await tour.count()) await tour.first().click();
  await page.goto('/#/' + route);
  await page.waitForTimeout(700);
}

module.exports = { fresh, enter };
