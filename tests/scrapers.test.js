import { describe, it, expect } from 'vitest';
import { parseRobots, isAllowed, mayFetch, UA } from '../scrapers/lib/robots.mjs';
import { toFeedItem, mergeItems, clusterKey, idFor } from '../scrapers/lib/contract.mjs';
import { parseFeed, parseJson } from '../scrapers/lib/parse.mjs';

const res = (status, body = '', headers = {}) => ({
  status, text: async () => body, headers: { get: k => headers[k.toLowerCase()] ?? null }
});

describe('parseRobots', () => {
  it('reads the * group when no group names us', () => {
    const r = parseRobots('User-agent: *\nDisallow: /private\nCrawl-delay: 5');
    expect(r.disallow).toEqual(['/private']);
    expect(r.crawlDelay).toBe(5);
  });
  it('prefers a group that names us over the * group', () => {
    const r = parseRobots('User-agent: *\nDisallow: /\n\nUser-agent: career-arcade-scraper\nDisallow: /admin', UA);
    expect(r.disallow).toEqual(['/admin']);
  });
  it('ignores comments and blank lines', () => {
    const r = parseRobots('# hello\nUser-agent: *\n\n  Disallow: /x   # trailing\n');
    expect(r.disallow).toEqual(['/x']);
  });
});

describe('isAllowed', () => {
  const rules = t => parseRobots(t);
  it('allows what is not disallowed', () => {
    expect(isAllowed(rules('User-agent: *\nDisallow: /private'), '/jobs')).toBe(true);
  });
  it('blocks what is disallowed', () => {
    expect(isAllowed(rules('User-agent: *\nDisallow: /private'), '/private/x')).toBe(false);
  });
  it('treats an empty Disallow as allowing everything', () => {
    expect(isAllowed(rules('User-agent: *\nDisallow:'), '/anything')).toBe(true);
  });
  it('lets a longer Allow override a broad Disallow', () => {
    const r = rules('User-agent: *\nDisallow: /\nAllow: /public/feed');
    expect(isAllowed(r, '/public/feed.xml')).toBe(true);
    expect(isAllowed(r, '/secret')).toBe(false);
  });
  it('understands * and $', () => {
    expect(isAllowed(rules('User-agent: *\nDisallow: /*.pdf$'), '/a/b.pdf')).toBe(false);
    expect(isAllowed(rules('User-agent: *\nDisallow: /*.pdf$'), '/a/b.pdf?x=1')).toBe(true);
  });
});

describe('mayFetch — the gate', () => {
  it('permits a path robots.txt allows', async () => {
    const g = await mayFetch('https://ok.test/jobs', async () => res(200, 'User-agent: *\nDisallow: /admin'), new Map());
    expect(g.allowed).toBe(true);
  });

  it('refuses a disallowed path', async () => {
    const g = await mayFetch('https://ok.test/admin/x', async () => res(200, 'User-agent: *\nDisallow: /admin'), new Map());
    expect(g.allowed).toBe(false);
    expect(g.reason).toMatch(/disallows/);
  });

  it('refuses when robots.txt cannot be read, rather than assuming it is fine', async () => {
    const down = await mayFetch('https://x.test/a', async () => { throw new Error('ECONNRESET'); }, new Map());
    expect(down.allowed).toBe(false);
    expect(down.reason).toMatch(/refusing to guess/);

    const five = await mayFetch('https://x.test/a', async () => res(503), new Map());
    expect(five.allowed).toBe(false);
    expect(five.reason).toMatch(/refusing to guess/);
  });

  it('treats a missing robots.txt as no restrictions, which is what the standard says', async () => {
    const g = await mayFetch('https://x.test/a', async () => res(404), new Map());
    expect(g.allowed).toBe(true);
  });

  it('refuses anything that is not http or https', async () => {
    for (const u of ['file:///etc/passwd', 'ftp://x.test/a', 'not a url']) {
      expect((await mayFetch(u, async () => res(404), new Map())).allowed).toBe(false);
    }
  });

  it('carries the site Crawl-delay back to the caller', async () => {
    const g = await mayFetch('https://slow.test/a', async () => res(200, 'User-agent: *\nCrawl-delay: 10'), new Map());
    expect(g.crawlDelay).toBe(10);
  });

  it('reads robots.txt once per host, not once per page', async () => {
    let hits = 0;
    const cache = new Map();
    const f = async () => { hits++; return res(200, 'User-agent: *\nDisallow:'); };
    await mayFetch('https://one.test/a', f, cache);
    await mayFetch('https://one.test/b', f, cache);
    expect(hits).toBe(1);
  });
});

describe('the user agent', () => {
  it('names the tool and carries nothing personal', () => {
    expect(UA).toMatch(/career-arcade-scraper/);
    expect(UA).not.toMatch(/@/);          // no email address
    expect(UA).not.toMatch(/\bartde\b/i); // no account or machine name
  });
});

describe('toFeedItem', () => {
  const source = { name: 'Example', host: 'example.test' };
  const good = { type: 'job', title: 'Backend intern', url: 'https://example.test/1' };

  it('accepts a complete row and stamps the dates', () => {
    const v = toFeedItem(good, source, new Date('2026-05-01T00:00:00Z'));
    expect(v.ok).toBe(true);
    expect(v.item).toMatchObject({ type: 'job', title: 'Backend intern', sourceCount: 1 });
    expect(v.item.lastSeen).toBe('2026-05-01T00:00:00.000Z');
    expect(v.item.source).toEqual(source);
  });

  it('rejects rather than inventing what is missing', () => {
    expect(toFeedItem({ ...good, title: '' }, source).why).toBe('no title');
    expect(toFeedItem({ ...good, url: '' }, source).why).toBe('no url');
    expect(toFeedItem({ ...good, type: 'gossip' }, source).why).toMatch(/is not one of/);
    expect(toFeedItem(good, { name: 'x' }).why).toMatch(/name and a host/);
  });

  it('refuses a url that is not http', () => {
    expect(toFeedItem({ ...good, url: 'javascript:alert(1)' }, source).ok).toBe(false);
    expect(toFeedItem({ ...good, url: 'file:///etc/passwd' }, source).ok).toBe(false);
  });

  it('leaves a facet out entirely when the source did not give it', () => {
    const { item } = toFeedItem(good, source);
    expect(item.deadline).toBe(null);
    expect('beginnerFriendly' in item).toBe(false);
    expect('commitmentHours' in item).toBe(false);
  });

  it('keeps a facet the source did give', () => {
    const { item } = toFeedItem({ ...good, beginnerFriendly: false, commitmentHours: 48, focus: 'fintech' }, source);
    expect(item.beginnerFriendly).toBe(false);
    expect(item.commitmentHours).toBe(48);
    expect(item.focus).toBe('fintech');
  });

  it('drops a date it cannot parse instead of storing Invalid Date', () => {
    const { item } = toFeedItem({ ...good, deadline: 'sometime next spring' }, source);
    expect(item.deadline).toBe(null);
  });

  it('gives the same listing the same id every run', () => {
    expect(idFor('Example', 'https://example.test/1')).toBe(idFor('Example', 'https://example.test/1'));
    expect(idFor('Example', 'https://example.test/1')).not.toBe(idFor('Other', 'https://example.test/1'));
  });
});

describe('clusterKey', () => {
  it('matches the same event across years and word order', () => {
    expect(clusterKey('Civic Build 2026', 'RK University')).toBe(clusterKey('Build Civic', 'RK University'));
    expect(clusterKey('Civic Build 2025', 'RK University')).toBe(clusterKey('Civic Build 2026', 'RK University'));
  });

  it('ignores filler words and punctuation', () => {
    expect(clusterKey('The Civic Build!', 'RK University')).toBe(clusterKey('Civic Build', 'RK University'));
  });

  /* Deliberately conservative: it will not split a run-together word. A missed duplicate shows the
     same thing twice, which is a small annoyance; a wrong merge hides a real opportunity. */
  it('does not guess that HackRajkot and Hack Rajkot are the same', () => {
    expect(clusterKey('HackRajkot', 'RK University')).not.toBe(clusterKey('Hack Rajkot', 'RK University'));
  });

  it('does not merge different events at the same place', () => {
    expect(clusterKey('Civic Build', 'RK University')).not.toBe(clusterKey('Robotics Jam', 'RK University'));
  });

  it('does not merge the same title at different organisations', () => {
    expect(clusterKey('Civic Build', 'RK University')).not.toBe(clusterKey('Civic Build', 'Other College'));
  });

  it('is null when there is nothing meaningful to key on', () => {
    expect(clusterKey('the and for', null)).toBe(null);
    expect(clusterKey('', 'Org')).toBe(null);
  });
});

describe('mergeItems', () => {
  const base = (over = {}) => ({
    id: 'a', type: 'job', title: 'Role', url: 'u', source: { name: 's', host: 'h' },
    firstSeen: '2026-01-01T00:00:00.000Z', lastSeen: '2026-01-01T00:00:00.000Z',
    lastChanged: '2026-01-01T00:00:00.000Z', deadline: null, ...over
  });
  const now = new Date('2026-06-01T00:00:00Z');

  it('never moves firstSeen', () => {
    const { items } = mergeItems([base()], [base({ firstSeen: '2026-05-05T00:00:00.000Z' })], now);
    expect(items[0].firstSeen).toBe('2026-01-01T00:00:00.000Z');
  });

  it('moves lastChanged only when something meaningful moved', () => {
    const same = mergeItems([base()], [base()], now);
    expect(same.items[0].lastChanged).toBe('2026-01-01T00:00:00.000Z');
    expect(same.stats.unchanged).toBe(1);

    const diff = mergeItems([base()], [base({ title: 'Role, updated' })], now);
    expect(diff.items[0].lastChanged).toBe('2026-06-01T00:00:00.000Z');
    expect(diff.stats.changed).toBe(1);
  });

  it('keeps a row that has vanished from its source, for the app to expire', () => {
    const { items, stats } = mergeItems([base()], [], now);
    expect(stats.gone).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0].lastSeen).toBe('2026-01-01T00:00:00.000Z');   // not pretended to be fresh
  });

  it('counts how many sources carry each cluster', () => {
    const { items } = mergeItems([], [
      base({ id: 'a', cluster: 'k' }), base({ id: 'b', cluster: 'k' }), base({ id: 'c', cluster: 'other' })
    ], now);
    expect(items.find(i => i.id === 'a').sourceCount).toBe(2);
    expect(items.find(i => i.id === 'c').sourceCount).toBe(1);
  });
});

describe('parseFeed', () => {
  it('reads RSS items', () => {
    const rows = parseFeed(`<rss><channel>
      <item><title>One</title><link>https://x.test/1</link><description>First</description></item>
      <item><title><![CDATA[Two & a half]]></title><link>https://x.test/2</link></item>
    </channel></rss>`);
    expect(rows).toHaveLength(2);
    expect(rows[1].title).toBe('Two & a half');
  });
  it('reads Atom entries, where the link is an attribute', () => {
    const rows = parseFeed(`<feed><entry><title>A</title><link href="https://x.test/a"/></entry></feed>`);
    expect(rows[0].url).toBe('https://x.test/a');
  });
  it('drops an entry with no title or no link rather than half-making one', () => {
    expect(parseFeed('<rss><item><title>no link</title></item></rss>')).toEqual([]);
  });
  it('returns nothing for junk instead of throwing', () => {
    expect(parseFeed('not xml at all')).toEqual([]);
    expect(parseFeed('')).toEqual([]);
  });
});

describe('parseJson', () => {
  it('follows the map the source config gives', () => {
    const body = JSON.stringify({ results: [{ position: 'Dev', link: 'https://x.test/1', company: 'Acme' }] });
    const rows = parseJson(body, { rows: 'results', title: 'position', url: 'link', org: 'company' });
    expect(rows).toEqual([{ title: 'Dev', url: 'https://x.test/1', org: 'Acme' }]);
  });
  it('finds the rows itself when no map is given', () => {
    expect(parseJson(JSON.stringify([{ title: 'T', url: 'https://x.test/1' }]), { title: 'title', url: 'url' })).toHaveLength(1);
  });
  it('returns nothing for junk instead of throwing', () => {
    expect(parseJson('{{{', {})).toEqual([]);
    expect(parseJson(JSON.stringify({ nope: 1 }), {})).toEqual([]);
  });
});
