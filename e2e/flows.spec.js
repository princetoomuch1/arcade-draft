import { test, expect } from '@playwright/test';

/* The critical flows, driven as a person would drive them. Each starts from a clean database so
   one test cannot quietly depend on another's leftovers. */

const ROUTES = ['menu', 'feed', 'jobs', 'hacks', 'news', 'more', 'notes', 'cal', 'apps', 'opts', 'desk', 'wall', 'credits'];

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

test.beforeEach(async ({ page }) => { await fresh(page); });

test('every route renders with no console errors', async ({ page }) => {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await enter(page, 'menu');
  for (const r of ROUTES) {
    await page.goto('/#/' + r);
    await page.waitForTimeout(500);
    await expect(page.locator('#page')).not.toBeEmpty();
  }
  expect(errors).toEqual([]);
});

test('onboarding: coin, start, the tour, and it never comes back', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.boot')).toContainText('INSERT COIN');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' })));
  await page.waitForTimeout(300);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' })));
  await page.waitForTimeout(1300);
  await expect(page.locator('.tour')).toBeVisible();
  await page.locator('.tour button').click();
  await expect(page.locator('.tour')).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(1300);
  await expect(page.locator('.tour')).toHaveCount(0);
});

test('saving an item puts it on the desk', async ({ page }) => {
  await enter(page, 'feed');
  await page.locator('.card').first().getByRole('button', { name: 'SAVE', exact: true }).click();
  await page.waitForTimeout(600);
  await page.goto('/#/desk');
  await page.waitForTimeout(900);
  await expect(page.locator('.paper')).toHaveCount(1);
});

test('the alignment slider reorders the drop', async ({ page }) => {
  await enter(page, 'feed');
  const ids = () => page.$$eval('.card', els => els.map(e => e.dataset.id));
  const before = await ids();
  await page.locator('.notches').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(800);
  expect(await ids()).not.toEqual(before);
});

test('jobs compare labels every value as disclosed, estimated or missing', async ({ page }) => {
  await enter(page, 'jobs');
  await page.locator('.tick').nth(0).click();
  await page.waitForTimeout(300);
  await page.locator('.tick').nth(1).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^COMPARE/ }).click();
  await page.waitForTimeout(700);
  await expect(page.locator('.vs')).toBeVisible();
  const tags = await page.$$eval('.vrow .tag', els => [...new Set(els.map(e => e.textContent.trim()))]);
  expect(tags.length).toBeGreaterThan(0);
  for (const t of tags) expect(['DISCLOSED', 'ESTIMATED', 'MISSING']).toContain(t);
});

test('quick capture writes a note that shows in the grid', async ({ page }) => {
  await enter(page, 'notes');
  await page.locator('#cap-text').fill('a captured thought');
  await page.getByRole('button', { name: 'CAPTURE', exact: true }).click();
  await page.waitForTimeout(800);
  await expect(page.locator('.note-cell')).toHaveCount(1);
});

test('a goal turns gold only when every checkpoint is done', async ({ page }) => {
  await enter(page, 'wall');
  await page.getByRole('button', { name: '+ GOAL' }).first().click();
  await page.waitForTimeout(400);
  const inputs = page.locator('.goal-form input');
  await inputs.nth(0).fill('Win a hackathon');
  await inputs.nth(1).fill('pick one, build it');
  await page.locator('.goal-form').getByRole('button', { name: '+ GOAL' }).click();
  await page.waitForTimeout(800);
  await page.locator('.goal .cp').nth(0).click();
  await page.waitForTimeout(600);
  await expect(page.locator('.goal.is-gold')).toHaveCount(0);
  await page.locator('.goal .cp').nth(1).click();
  await page.waitForTimeout(800);
  await expect(page.locator('.goal.is-gold')).toHaveCount(1);
});

test('undo brings back a crumpled item', async ({ page }) => {
  await enter(page, 'feed');
  await page.locator('.card').first().getByRole('button', { name: 'SAVE', exact: true }).click();
  await page.waitForTimeout(600);
  await page.goto('/#/desk');
  await page.waitForTimeout(900);
  await expect(page.locator('.paper')).toHaveCount(1);
  await page.locator('.paper .tosser').click();
  await page.waitForTimeout(1000);
  await expect(page.locator('.paper')).toHaveCount(0);
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'u' })));
  await page.waitForTimeout(1000);
  await expect(page.locator('.paper')).toHaveCount(1);
});

test('export then import round-trips a note', async ({ page }) => {
  await enter(page, 'notes');
  await page.locator('#cap-text').fill('survive the round trip');
  await page.getByRole('button', { name: 'CAPTURE', exact: true }).click();
  await page.waitForTimeout(800);

  const backup = await page.evaluate(async () => {
    const S = await import('/src/store.js');
    return S.exportBackup();
  });
  expect(backup.data.notes).toHaveLength(1);

  const after = await page.evaluate(async b => {
    const S = await import('/src/store.js');
    for (const r of await S.all('notes')) await S.del('notes', r.id);
    await S.importBackup(b, 'replace');
    return (await S.all('notes')).map(n => n.body_md);
  }, backup);
  expect(after).toEqual(['survive the round trip']);
});

test('offline still shows the app rather than a dead page', async ({ page, context }) => {
  await enter(page, 'feed');
  await page.evaluate(() => navigator.serviceWorker.register('sw.js'));
  await page.waitForTimeout(2500);
  await page.reload();
  await page.waitForTimeout(1500);

  await context.setOffline(true);
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(page.locator('#app')).not.toBeEmpty();
  await context.setOffline(false);
});

test('the feed ends rather than scrolling for ever', async ({ page }) => {
  await enter(page, 'feed');
  await expect(page.locator('.clear')).toContainText('STAGE CLEAR');
  const text = await page.locator('#page').innerText();
  expect(text.replace(/NO LOAD MORE HERE[^\n]*/gi, '')).not.toMatch(/load more/i);
});
