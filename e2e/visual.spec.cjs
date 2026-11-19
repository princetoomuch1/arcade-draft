/* The checks that would have caught what a person had to report by hand.
 *
 * A green unit test said the Feed was fine while its card rows, each given an exact `height`,
 * drew their text on top of each other. These assertions look at the rendered boxes instead.
 */
const { test, expect } = require('@playwright/test');
const { fresh, enter } = require('./app.cjs');

const ROUTES = ['menu', 'feed', 'jobs', 'hacks', 'news', 'more', 'notes', 'cal', 'apps', 'opts',
  'desk', 'wall', 'credits'];

/* Text that is allowed to sit on top of other things, by design. */
const FLOATING = ['.z-toast', '.toast-undo', '.tour', '.boot', '.wipe', '.crt', '.coinfly',
  '.plusone', '.pr-mark', '.pr-nav', '.vw-pill', '.pr-exit', '.too-small'];

/**
 * Every pair of visible text leaves that overlap by more than a hair.
 * Leaves only: a parent always "overlaps" its child, and that is just containment.
 */
async function overlaps(page) {
  return page.evaluate(floating => {
    const skip = el => floating.some(sel => el.closest(sel));
    const boxes = [];
    for (const el of document.querySelectorAll('#page *, .topbar *, .tabbar *')) {
      if (el.children.length || !el.textContent.trim()) continue;      // leaves with text only
      if (skip(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      if (cs.position === 'absolute' || cs.position === 'fixed') continue;  // deliberate stacking
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      boxes.push({ r, t: el.textContent.trim().slice(0, 30), c: el.className || el.tagName });
    }
    const hits = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r;
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        // 2px of overlap is a rounding artefact; 4px is two lines of text sharing a row
        if (x > 4 && y > 4) hits.push(`"${boxes[i].t}" (${boxes[i].c}) over "${boxes[j].t}" (${boxes[j].c})`);
      }
    }
    return hits;
  }, FLOATING);
}

test.beforeEach(async ({ page }) => { await fresh(page); });

for (const r of ROUTES) {
  test(`${r}: no text draws on top of other text`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await enter(page, r);
    const hits = await overlaps(page);
    expect(hits, `overlapping text on /${r}:\n` + hits.join('\n')).toEqual([]);
  });
}

test('no dead or placeholder links anywhere', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page, 'desk');
  const bad = [];
  for (const r of ROUTES) {
    await page.goto('/#/' + r);
    await page.waitForTimeout(600);
    const hrefs = await page.$$eval('#page a[href]', as => as.map(a => ({
      href: a.getAttribute('href'), text: a.textContent.trim().slice(0, 24),
      target: a.getAttribute('target'), rel: a.getAttribute('rel')
    })));
    for (const h of hrefs) {
      if (!h.href || h.href === '#' || h.href.includes('undefined') || h.href === 'null') {
        bad.push(`/${r}: "${h.text}" -> ${h.href}`);
      }
      if (/^https?:/i.test(h.href) && (h.target !== '_blank' || !/noopener/.test(h.rel || ''))) {
        bad.push(`/${r}: "${h.text}" opens in place or without noopener`);
      }
      if (/\/\/(seed\.local|localhost|example\.(com|org))/i.test(h.href)) {
        bad.push(`/${r}: "${h.text}" points at a host that does not resolve: ${h.href}`);
      }
    }
  }
  expect(bad, bad.join('\n')).toEqual([]);
});

test('news: nothing is set larger than a headline', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page, 'news');
  const biggest = await page.evaluate(() => {
    let max = 0, worst = '';
    for (const el of document.querySelectorAll('#page *')) {
      if (el.children.length || !el.textContent.trim()) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs > max) { max = fs; worst = (el.className || el.tagName) + ': ' + el.textContent.trim().slice(0, 30); }
    }
    return { max, worst };
  });
  expect(biggest.max, `largest text on News is ${biggest.max}px — ${biggest.worst}`).toBeLessThanOrEqual(28);
});

test('news: twenty clippings, a ticker of five, and more behind a button', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page, 'news');
  const clips = await page.locator('.clip').count();
  expect(clips).toBeGreaterThanOrEqual(10);        // 20 rows, some of which cluster into one card
  const ticker = await page.locator('.tape').textContent();
  expect(ticker.split('·').length).toBeGreaterThanOrEqual(5);
  // whatever else happens, the page must not scroll for ever
  await expect(page.locator('#page')).not.toContainText('LOADING MORE');
});

test('every route renders something, and no container is left empty', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page, 'desk');
  const thin = [];
  for (const r of ROUTES) {
    await page.goto('/#/' + r);
    await page.waitForTimeout(600);
    const len = (await page.locator('#page').innerText()).trim().length;
    if (len < 40) thin.push(`/${r} rendered only ${len} characters`);
  }
  expect(thin, thin.join('\n')).toEqual([]);
});
