/* CommonJS on purpose: loading an ESM spec through Playwright's esmLoaderHost hangs
   with no output on this machine (Windows, "type": "module", path with spaces).
   Plain require() skips that loader entirely. */
const { test, expect } = require('@playwright/test');

/* Phase 12: the share screen.
 *
 * The share is the only part of this app that leaves the machine, so these tests are about what
 * does NOT travel as much as what does. The privacy test asserts on the decoded payload rather
 * than on the rendered page: a field could be present and merely unstyled, and that would still
 * be a leak.
 *
 * The mobile test is here because the recipient is the one person who does not have the desktop
 * the rest of the app insists on. They open the link from a message, on a phone.
 */

const { fresh, enter } = require('./app.cjs');

/* Data with something private in every corner: an email in a wall note, a note body, and an
   application. If any of it reaches a payload, the allowlist has a hole. */
async function seed(page) {
  await page.evaluate(async () => {
    const S = await import('/src/store.js');
    await S.put('wallpins', {
      id: 'p1', zone: 'MOTIVATION', type: 'text',
      content: 'Ship it. Reach me at riya@example.test or 98765 43210.'
    });
    await S.put('wallpins', { id: 'p2', zone: 'MEMORIES', type: 'text', content: 'First offer.' });
    await S.put('goals', {
      id: 'g1', title: 'Land a summer internship', gold: false,
      checkpoints: [{ text: 'Rewrite the CV', done: true }, { text: 'Apply to ten', done: false }]
    });
    await S.put('notes', {
      id: 'n1', title: 'Interview prep', body_md: 'Recruiter is hema@example.test. Flat 12 Nehru Road.'
    });
    await S.put('apps', {
      id: 'a1', title: 'Backend intern at Acme', stage: 'interview', trust: 'manual',
      contact: 'hiring@acme.example', notes: 'asked about salary'
    });
  });
}

test.beforeEach(async ({ page }) => { await fresh(page); });

test('the builder starts with nothing ticked and says so', async ({ page }) => {
  await enter(page, 'share');
  await seed(page);
  await page.goto('/#/share');
  await page.waitForTimeout(800);

  const boxes = page.locator('.sb-step input[type="checkbox"]');
  expect(await boxes.count()).toBeGreaterThan(5);
  for (let i = 0; i < await boxes.count(); i++) {
    await expect(boxes.nth(i)).not.toBeChecked();
  }
  await expect(page.locator('.sb-preview')).toContainText('Nothing was chosen');
  await expect(page.locator('.creed')).toContainText('APPLICATIONS ARE NEVER SHAREABLE');
});

test('ticking a section puts it in the preview, and masks what it finds', async ({ page }) => {
  await enter(page, 'share');
  await seed(page);
  await page.goto('/#/share');
  await page.waitForTimeout(800);

  await page.locator('#ch-motivation').check();
  await page.locator('#ch-goals').check();
  await page.waitForTimeout(400);

  const preview = page.locator('.sb-preview');
  await expect(preview).toContainText('Ship it.');
  await expect(preview).toContainText('Land a summer internship');
  // the email and the phone number in that same pin are masked, not shown
  await expect(preview).not.toContainText('riya@example.test');
  await expect(preview).not.toContainText('98765 43210');
  await expect(preview).toContainText('██');
  // checkpoints are working detail and are off until asked for
  await expect(preview).not.toContainText('Rewrite the CV');
});

test('the payload carries only what was ticked: no applications, no contacts, no ids', async ({ page }) => {
  await enter(page, 'share');
  await seed(page);
  await page.goto('/#/share');
  await page.waitForTimeout(800);

  for (const id of ['ch-motivation', 'ch-memories', 'ch-goals', 'ch-trophies', 'ch-journey']) {
    await page.locator('#' + id).check();
  }
  await page.selectOption('#share-note', 'n1');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'MAKE A LINK' }).click();
  await page.waitForTimeout(800);

  const link = await page.locator('#share-link').inputValue();
  expect(link).toContain('#/share?d=');

  const decoded = await page.evaluate(async url => {
    const { decodePayload } = await import('/src/share/payload.js');
    const d = new URL(url).hash.split('d=')[1];
    const r = await decodePayload(decodeURIComponent(d));
    return { ok: r.ok, keys: Object.keys(r.payload || {}).sort(), json: JSON.stringify(r.payload) };
  }, link);

  expect(decoded.ok).toBe(true);
  expect(decoded.keys).toEqual(['createdAt', 'expiresAt', 'redactionReport', 'sections', 'style', 'v']);

  // nothing private survived, whatever shape it would have taken
  for (const secret of [
    'Backend intern at Acme', 'hiring@acme.example', 'asked about salary',
    'riya@example.test', 'hema@example.test', 'Nehru Road', '98765',
    'body_md', 'Recruiter is', 'Rewrite the CV', '"a1"', '"n1"', '"g1"', '"p1"'
  ]) {
    expect(decoded.json, `payload must not contain ${secret}`).not.toContain(secret);
  }
  // and what was asked for is there
  expect(decoded.json).toContain('Land a summer internship');
  expect(decoded.json).toContain('Interview prep');
});

test('the share view is mobile-responsive: no desktop-only card, no sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await enter(page, 'share');
  await seed(page);
  await page.goto('/#/share');
  await page.waitForTimeout(800);
  await page.locator('#ch-motivation').check();
  await page.locator('#ch-journey').check();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'MAKE A LINK' }).click();
  await page.waitForTimeout(800);
  const link = await page.locator('#share-link').inputValue();

  // open it the way a recipient would: the URL alone, on a phone-sized screen
  await page.goto(new URL(link).hash ? '/' + new URL(link).hash : '/#/share');
  await page.waitForTimeout(1500);

  await expect(page.locator('.sv')).toBeVisible();
  await expect(page.locator('.too-small')).toBeHidden();
  await expect(page.locator('.sv')).not.toContainText('RESIZE THE WINDOW');
  // the app's own chrome is not the recipient's to use
  for (const sel of ['.topbar', '.tabbar', '.keybar']) {
    if (await page.locator(sel).count()) await expect(page.locator(sel)).toBeHidden();
  }
  const over = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(over, 'the share must not scroll sideways on a 375px screen').toBe(false);
  // and the masking holds in the recipient's copy
  await expect(page.locator('.sv')).not.toContainText('riya@example.test');
});

test('an expired share says so and shows nothing else', async ({ page }) => {
  await enter(page, 'share');
  const link = await page.evaluate(async () => {
    const { buildPayload, encodePayload } = await import('/src/share/payload.js');
    const p = buildPayload(
      { pins: [{ id: 'x', zone: 'MOTIVATION', type: 'text', content: 'A SECRET SENTENCE' }] },
      { choices: { motivation: true }, header: { name: 'Riya' }, expiryDays: 7,
        now: Date.now() - 30 * 864e5 }
    );
    return '#/share?d=' + encodeURIComponent(await encodePayload(p));
  });
  await page.goto('/' + link);
  await page.waitForTimeout(1500);

  await expect(page.locator('.sv-expired')).toContainText('expired');
  await expect(page.locator('#page')).not.toContainText('A SECRET SENTENCE');
  await expect(page.locator('#page')).toContainText('fresh link');
});

test('a corrupted link fails honestly', async ({ page }) => {
  await enter(page, 'share');
  await page.goto('/#/share?d=not-a-real-payload');
  await page.waitForTimeout(1500);
  await expect(page.locator('#page')).toContainText('did not open');
  await expect(page.locator('#page')).toContainText('invalid or corrupted');
});

test('present mode hides the chrome, walks the room, and gives it back on exit', async ({ page }) => {
  await enter(page, 'desk');
  await page.goto('/#/viewer');
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => document.documentElement.dataset.mode)).toBe('viewer');

  // straight from the viewer into present mode: the viewer's teardown must not take the mode with it
  await page.goto('/#/present');
  await page.waitForTimeout(1600);
  expect(await page.evaluate(() => document.documentElement.dataset.mode)).toBe('present');
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('.tabbar')).toBeHidden();
  await expect(page.locator('.sb-note')).toContainText('1 OF 8');

  await page.evaluate(() =>
    document.dispatchEvent(new CustomEvent('arcade:key', { detail: { key: 'arrowright' } })));
  await page.waitForTimeout(1000);
  await expect(page.locator('.sb-note')).toContainText('2 OF 8');

  await page.locator('.pr-exit').click();
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => document.documentElement.dataset.mode)).toBeUndefined();
  await expect(page.locator('.topbar')).toBeVisible();
});

test('the viewer takes every control away', async ({ page }) => {
  await enter(page, 'desk');
  await page.goto('/#/viewer');
  await page.waitForTimeout(1400);
  await expect(page.locator('.vw-pill')).toContainText('EXIT VIEWER');
  await expect(page.locator('.sb-note')).toContainText('READ ONLY');
  expect(await page.locator('#page input, #page select, #page textarea').count()).toBe(0);
});

test('the shares list is honest about what a link cannot be taken back', async ({ page }) => {
  await enter(page, 'share');
  await seed(page);
  await page.goto('/#/share');
  await page.waitForTimeout(800);
  await page.locator('#ch-journey').check();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'MAKE A LINK' }).click();
  await page.waitForTimeout(800);

  await page.goto('/#/shares');
  await page.waitForTimeout(1000);
  await expect(page.locator('#page')).toContainText('THIS KIND CANNOT BE REVOKED');
  await expect(page.locator('#page')).toContainText('NOTHING REPORTS BACK');
  await expect(page.getByRole('button', { name: 'FORGET THIS ROW' })).toBeVisible();
});
