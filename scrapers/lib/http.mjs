/* Polite HTTP. Every outbound request in this project goes through here.
 *
 * It is slow on purpose: one request at a time per host, a floor of one second between them, the
 * site's own Crawl-delay honoured when it asks for more, and conditional requests so a page that
 * has not changed costs the site almost nothing.
 *
 * It sends no personal information. The user agent names the tool and nothing else: no email, no
 * machine name, no account. If a site needs a contact address, that is the user's to add.
 */

import { mayFetch, UA } from './robots.mjs';

const MIN_GAP_MS = 1000;
const MAX_RETRIES = 2;
const lastHit = new Map();
const robotsCache = new Map();

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** One request at a time per host, never faster than the host allows. */
async function waitTurn(origin, crawlDelay) {
  const gap = Math.max(MIN_GAP_MS, (crawlDelay || 0) * 1000);
  const last = lastHit.get(origin) || 0;
  const wait = last + gap - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(origin, Date.now());
}

/**
 * Fetch a page if and only if robots.txt permits it.
 * @param {string} url
 * @param {{etag?: string, lastModified?: string, fetchImpl?: any, log?: (m: string) => void}} [opts]
 * @returns {Promise<{status: number, body?: string, etag?: string, lastModified?: string,
 *                    skipped?: string, unchanged?: boolean}>}
 */
export async function polite(url, opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const log = opts.log || (() => {});

  const gate = await mayFetch(url, fetchImpl, robotsCache);
  if (!gate.allowed) {
    log(`skip ${url}: ${gate.reason}`);
    return { status: 0, skipped: gate.reason };
  }

  const origin = new URL(url).origin;
  const headers = { 'User-Agent': UA, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' };
  // Conditional request: if nothing changed the site sends 304 and almost no bytes.
  if (opts.etag) headers['If-None-Match'] = opts.etag;
  if (opts.lastModified) headers['If-Modified-Since'] = opts.lastModified;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitTurn(origin, gate.crawlDelay);
    try {
      const res = await fetchImpl(url, { headers, redirect: 'follow' });

      if (res.status === 304) return { status: 304, unchanged: true };

      // Back off when asked to, and give up rather than hammering.
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers?.get?.('retry-after')) || 0;
        if (attempt === MAX_RETRIES) { log(`give up on ${url}: ${res.status}`); return { status: res.status }; }
        await sleep(Math.max(retryAfter * 1000, 2000 * (attempt + 1)));
        continue;
      }
      if (res.status >= 400) { log(`skip ${url}: ${res.status}`); return { status: res.status }; }

      return {
        status: res.status,
        body: await res.text(),
        etag: res.headers?.get?.('etag') || undefined,
        lastModified: res.headers?.get?.('last-modified') || undefined
      };
    } catch (e) {
      if (attempt === MAX_RETRIES) { log(`error on ${url}: ${e.message}`); return { status: 0, skipped: e.message }; }
      await sleep(2000 * (attempt + 1));
    }
  }
  return { status: 0, skipped: 'exhausted retries' };
}

export { UA };
