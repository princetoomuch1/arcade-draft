/* Check a site before you scrape it, and print the sources.json entry if it is clear.
 *
 *   npm run check-source -- https://example.org/jobs hackathon
 *
 * It does three things and nothing else:
 *   1. reads robots.txt and says whether that exact path is permitted, and what Crawl-delay is asked
 *   2. looks for a feed the publisher advertises, because a feed is kinder than scraping HTML
 *   3. prints the entry to paste, or refuses and says why
 *
 * It fetches robots.txt and, if allowed, the page itself, once. It changes nothing.
 * It cannot read a site's terms of use for you. That part is yours.
 */

import { mayFetch, UA } from '../scrapers/lib/robots.mjs';
import { polite } from '../scrapers/lib/http.mjs';
import { parseFeed } from '../scrapers/lib/parse.mjs';

const [, , target, type = 'news'] = process.argv;

if (!target) {
  console.log('usage: npm run check-source -- <url> [hackathon|job|internship|news|scheme|event]');
  process.exit(1);
}

const say = (...a) => console.log(...a);

let url;
try { url = new URL(target); }
catch { say(`"${target}" is not a URL.`); process.exit(1); }

say(`\nChecking ${url.href}`);
say(`as: ${UA}\n`);

const gate = await mayFetch(url.href);
if (!gate.allowed) {
  say(`REFUSED — ${gate.reason}`);
  say('\nNothing was fetched beyond robots.txt. Do not add this source.');
  process.exit(2);
}
say('robots.txt: this path is permitted.');
say(gate.crawlDelay ? `Crawl-delay: the site asks for ${gate.crawlDelay}s between requests.`
  : 'Crawl-delay: none stated, so the 1s floor applies.');

const res = await polite(url.href, { log: say });
if (res.status !== 200 || !res.body) {
  say(`\nCould not read the page (HTTP ${res.status}${res.skipped ? `: ${res.skipped}` : ''}).`);
  process.exit(2);
}

const body = res.body;
const isFeed = /<rss\b|<feed\b/i.test(body.slice(0, 2000));
let kind = null, feedUrl = null;

if (isFeed) {
  kind = 'feed'; feedUrl = url.href;
  say(`\nThis is a feed. ${parseFeed(body).length} entries parsed.`);
} else {
  // A page that advertises its own feed is telling you how it wants to be read.
  const found = [...body.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)]
    .map(m => (m[0].match(/href=["']([^"']+)["']/i) || [])[1])
    .filter(Boolean)
    .map(h => new URL(h, url.href).href);
  if (found.length) {
    kind = 'feed'; feedUrl = found[0];
    say(`\nThis page advertises a feed: ${found[0]}`);
    say('Use the feed. It is lighter on the site and far more stable than its markup.');
  } else {
    say('\nNo feed found, and this is an HTML page.');
    say('There is no HTML scraper in this project, on purpose: markup breaks, strains the site,');
    say('and is the part most likely to fall foul of terms of use.');
    say('Look for an API or a feed, or leave this source out.');
    process.exit(3);
  }
}

say('\nIf the site\'s terms allow personal, non-commercial reading, add this to scrapers/sources.json:\n');
say(JSON.stringify({ name: url.hostname.replace(/^www\./, ''), host: url.hostname, type, kind, url: feedUrl }, null, 2));
say('\nThe terms are the one part this tool cannot check. Read them yourself.\n');
