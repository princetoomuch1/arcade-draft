/* robots.txt, honoured rather than glanced at.
 *
 * The rule here is deliberately strict: if we cannot read or cannot parse a site's robots.txt, we
 * do NOT fetch that site. A scraper that treats "I could not check" as "probably fine" is the
 * reason scrapers get blocked, and it is not a decision this code gets to make on your behalf.
 */

export const UA = 'career-arcade-scraper/0.1 (personal use; honours robots.txt)';

/**
 * Parse robots.txt into the groups that apply to a user agent.
 * Longest-match wins on path, as the standard says, and Allow beats Disallow at equal length.
 * @returns {{allow: string[], disallow: string[], crawlDelay: number|null}}
 */
export function parseRobots(text, ua = UA) {
  const lines = String(text || '').split('\n').map(l => l.replace(/#.*$/, '').trim()).filter(Boolean);
  const groups = [];
  let current = null;

  for (const line of lines) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    const field = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();

    if (field === 'user-agent') {
      if (!current || current.started) { current = { agents: [], allow: [], disallow: [], crawlDelay: null, started: false }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if (current) {
      current.started = true;
      if (field === 'allow' && value) current.allow.push(value);
      else if (field === 'disallow') current.disallow.push(value);
      else if (field === 'crawl-delay') { const n = Number(value); if (!Number.isNaN(n)) current.crawlDelay = n; }
    }
  }

  const name = ua.split('/')[0].toLowerCase();
  const mine = groups.filter(g => g.agents.some(a => a !== '*' && name.includes(a)));
  const star = groups.filter(g => g.agents.includes('*'));
  const use = mine.length ? mine : star;

  return {
    allow: use.flatMap(g => g.allow),
    disallow: use.flatMap(g => g.disallow),
    crawlDelay: use.reduce((m, g) => (g.crawlDelay != null ? Math.max(m ?? 0, g.crawlDelay) : m), /** @type {number|null} */(null))
  };
}

/** A robots path pattern, with * and $ as the standard allows. */
function matches(pattern, path) {
  if (pattern === '') return false;                       // "Disallow:" with nothing means allow all
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp('^' + body.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (anchored ? '$' : ''));
  return re.test(path);
}

/** @returns {boolean} true only when robots positively permits this path. */
export function isAllowed(rules, path) {
  const best = list => list.reduce((m, p) => (matches(p, path) && p.length > (m?.length ?? -1) ? p : m), /** @type {string|null} */(null));
  const a = best(rules.allow), d = best(rules.disallow);
  if (!d) return true;
  if (!a) return false;
  return a.length >= d.length;      // equal length: Allow wins, per the standard
}

/**
 * Fetch and cache a host's robots.txt. A host we could not check is refused, loudly.
 * `fetchImpl` is narrowed to what this uses, so a test can pass a two-field stub.
 * @param {string} origin
 * @param {(url: string, opts?: object) => Promise<{status: number, text: () => Promise<string>}>} [fetchImpl]
 * @param {Map<string, any>} [cache]
 * @returns {Promise<{ok: boolean, rules?: object, reason?: string}>}
 */
export async function robotsFor(origin, fetchImpl = fetch, cache = new Map()) {
  if (cache.has(origin)) return cache.get(origin);
  let result;
  try {
    const res = await fetchImpl(`${origin}/robots.txt`, { headers: { 'User-Agent': UA } });
    if (res.status === 404) {
      // No robots.txt at all is the one case the standard says means "no restrictions".
      result = { ok: true, rules: { allow: [], disallow: [], crawlDelay: null } };
    } else if (res.status >= 400) {
      result = { ok: false, reason: `robots.txt returned ${res.status}; refusing to guess` };
    } else {
      result = { ok: true, rules: parseRobots(await res.text()) };
    }
  } catch (e) {
    result = { ok: false, reason: `could not read robots.txt (${e.message}); refusing to guess` };
  }
  cache.set(origin, result);
  return result;
}

/**
 * The one gate every request goes through.
 * @param {string} url
 * @param {(url: string, opts?: object) => Promise<{status: number, text: () => Promise<string>}>} [fetchImpl]
 * @param {Map<string, any>} [cache]
 * @returns {Promise<{allowed: boolean, reason?: string, crawlDelay: number|null}>}
 */
export async function mayFetch(url, fetchImpl = fetch, cache = new Map()) {
  let u;
  try { u = new URL(url); } catch { return { allowed: false, reason: 'not a URL', crawlDelay: null }; }
  if (!/^https?:$/.test(u.protocol)) return { allowed: false, reason: `refusing protocol ${u.protocol}`, crawlDelay: null };

  const r = await robotsFor(u.origin, fetchImpl, cache);
  if (!r.ok) return { allowed: false, reason: r.reason, crawlDelay: null };
  const allowed = isAllowed(r.rules, u.pathname + u.search);
  return {
    allowed,
    reason: allowed ? undefined : `robots.txt disallows ${u.pathname}`,
    crawlDelay: r.rules.crawlDelay
  };
}
