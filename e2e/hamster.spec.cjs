/* CommonJS on purpose: see the note in e2e/app.cjs. */
const { test, expect } = require('@playwright/test');
const { fresh, enter } = require('./app.cjs');

/* Mochi.
 *
 * Half of these tests are about what she must NOT do. A pet is the easiest place in an app to
 * smuggle in a guilt loop — a sad face, a hunger bar, "it has been 5 days" — so the absence of
 * those is asserted, not merely intended.
 */

const SHOT = 'screenshots/hamster';
const pet = page => page.evaluate(async () => (await import('/src/main.js')).ctx.hamster.data);
const call = (page, fn, arg) => page.evaluate(async ([f, a]) => {
  const { ctx } = await import('/src/main.js');
  return ctx.hamster[f](a);
}, [fn, arg]);

test.beforeEach(async ({ page }) => { await fresh(page); });

test('she lives on the desk, bottom-right, and nowhere else', async ({ page }) => {
  await enter(page, 'desk');
  const ham = page.locator('.ham');
  await expect(ham).toBeVisible();

  const box = await ham.boundingBox();
  const world = await page.locator('.world').boundingBox();
  expect(box.x + box.width).toBeGreaterThan(world.x + world.width * 0.6);    // right-hand side
  expect(box.y + box.height).toBeGreaterThan(world.y + world.height * 0.6);  // lower half

  for (const r of ['wall', 'feed', 'news', 'menu', 'opts']) {
    await page.goto('/#/' + r);
    await page.waitForTimeout(500);
    await expect(page.locator('.ham')).toHaveCount(0);
  }
});

test('all seven states render, and each one is photographed', async ({ page }) => {
  await enter(page, 'desk');
  const ham = page.locator('.ham');
  await expect(ham).toBeVisible();

  for (const s of ['idle', 'eating', 'sleeping', 'running', 'happy', 'excited', 'curious']) {
    await call(page, 'setState', s);
    await page.waitForTimeout(300);
    await expect(ham).toHaveAttribute('data-state', s);
    // actually drawn: a frame is a few hundred rects, not an empty <svg>
    expect(await page.locator('.ham-art rect').count(), `${s} drew nothing`).toBeGreaterThan(40);
    await ham.screenshot({ path: `${SHOT}/${s}-desktop.png` });
  }
});

test('a click pets her: happy, hearts, and the mood goes up', async ({ page }) => {
  await enter(page, 'desk');
  const before = (await pet(page)).mood;
  await page.locator('.ham-hit').click();
  await page.waitForTimeout(250);
  await expect(page.locator('.ham')).toHaveAttribute('data-state', 'happy');
  expect(await page.locator('.ham-heart').count()).toBeGreaterThan(0);
  expect((await pet(page)).mood).toBeGreaterThan(before);
});

test('the menu offers five things, and feed and play do what they say', async ({ page }) => {
  await enter(page, 'desk');
  await page.locator('.ham-hit').click({ button: 'right' });
  expect(await page.locator('.ham-mi').allTextContents()).toEqual(['FEED', 'SLEEP', 'PLAY', 'RENAME', 'HIDE']);

  await page.locator('.ham-mi', { hasText: 'FEED' }).click();
  await expect(page.locator('.ham')).toHaveAttribute('data-state', 'eating');
  expect((await pet(page)).lastFed).toBeTruthy();

  await page.waitForTimeout(2700);
  await page.locator('.ham-hit').click({ button: 'right' });
  await page.locator('.ham-mi', { hasText: 'PLAY' }).click();
  await expect(page.locator('.ham')).toHaveAttribute('data-state', 'running');
  expect((await pet(page)).lastPlayed).toBeTruthy();
});

test('sleep holds until a click anywhere wakes her', async ({ page }) => {
  await enter(page, 'desk');
  await page.locator('.ham-hit').click({ button: 'right' });
  await page.locator('.ham-mi', { hasText: 'SLEEP' }).click();
  await expect(page.locator('.ham')).toHaveAttribute('data-state', 'sleeping');
  await page.waitForTimeout(1200);
  await expect(page.locator('.ham')).toHaveAttribute('data-state', 'sleeping');  // no timeout out of it
  await page.locator('.world').click({ position: { x: 20, y: 20 } });
  await page.waitForTimeout(300);
  await expect(page.locator('.ham')).toHaveAttribute('data-state', 'idle');
});

test('a new name survives a reload', async ({ page }) => {
  await enter(page, 'desk');
  await page.locator('.ham-hit').click({ button: 'right' });
  await page.locator('.ham-mi', { hasText: 'RENAME' }).click();
  const input = page.locator('.ham-menu input');
  await input.fill('Pochi');
  await input.press('Enter');
  await page.waitForTimeout(400);

  await page.reload();
  await enter(page, 'desk');
  expect((await pet(page)).name).toBe('Pochi');
  await expect(page.locator('.ham-hit')).toHaveAttribute('aria-label', 'Pet Pochi');
});

test('HIDE puts her away for now, and she is back next launch', async ({ page }) => {
  await enter(page, 'desk');
  await page.locator('.ham-hit').click({ button: 'right' });
  await page.locator('.ham-mi', { hasText: 'HIDE' }).click();
  await expect(page.locator('.ham')).toBeHidden();
  await page.reload();
  await enter(page, 'desk');
  await expect(page.locator('.ham')).toBeVisible();
});

test('saving the first thing levels her up — the act, never the clock', async ({ page }) => {
  await enter(page, 'feed');
  await page.getByRole('button', { name: /^SAVE/ }).first().click();
  await page.waitForTimeout(600);
  await enter(page, 'desk');
  await page.waitForTimeout(900);
  const d = await pet(page);
  expect(d.milestonesHit).toContain('first-save');
  expect(d.level).toBeGreaterThan(1);
  expect(d.accessories.length).toBeGreaterThan(0);
});

test('three days away is a greeting, never a complaint', async ({ page }) => {
  await enter(page, 'desk');
  await page.evaluate(async () => {
    const S = await import('/src/store.js');
    const h = await S.hamster();
    h.lastSeen = new Date(Date.now() - 3 * 864e5).toISOString();
    h.mood = 5;
    await S.saveHamster(h);
  });
  await page.reload();
  await enter(page, 'desk');
  await page.waitForTimeout(1500);

  await expect(page.locator('.ham-say')).toHaveText('Welcome back.');

  const text = (await page.locator('.world').innerText()).toLowerCase();
  for (const guilt of ['missed you', 'where were you', 'you left', 'hungry', 'starv', 'sad',
    'neglect', 'abandon', 'days since', 'streak']) {
    expect(text, `she must never say "${guilt}"`).not.toContain(guilt);
  }
  /* "come back" as a nag, with the word boundary the copy audit uses — so this catches
     "Come back tomorrow!" while leaving her actual greeting, "Welcome back.", alone. */
  expect(text, 'she must not nag you to return').not.toMatch(/\bcome back\b/);
  expect((await pet(page)).mood).toBeGreaterThanOrEqual(2);
  await page.locator('.ham').screenshot({ path: `${SHOT}/welcome-back-desktop.png` });
});

test('a month away still leaves her content, not miserable', async ({ page }) => {
  await enter(page, 'desk');
  const mood = await page.evaluate(async () => {
    const S = await import('/src/store.js');
    return S.drift({ ...S.blankHamster(), mood: 5,
      lastSeen: new Date(Date.now() - 60 * 864e5).toISOString() }).mood;
  });
  expect(mood).toBe(2);
});
