import { describe, it, expect } from 'vitest';
import * as S from '../src/store.js';
import { ago, freshness } from '../src/receipt.js';

const HOUR = 36e5, DAY = 864e5;
const iso = t => new Date(t).toISOString();
const item = (id, over = {}) => ({ id, type: 'news', title: id, url: 'u', source: { name: 'Src', host: 'h' }, ...over });

describe('clusterItems', () => {
  it('collapses a cluster to one group and keeps the rest as its sources', () => {
    const items = [
      item('a', { cluster: 'c', firstSeen: iso(Date.now() - 3 * HOUR) }),
      item('b', { cluster: 'c', firstSeen: iso(Date.now() - 9 * HOUR) }),
      item('solo')
    ];
    const out = S.clusterItems(items);
    expect(out).toHaveLength(2);
    const group = out.find(g => g.cluster === 'c');
    expect(group.others).toHaveLength(1);
  });

  it('leads with the one seen first, not whoever copied it loudest', () => {
    const items = [
      item('late', { cluster: 'c', firstSeen: iso(Date.now() - 1 * HOUR) }),
      item('first', { cluster: 'c', firstSeen: iso(Date.now() - 20 * HOUR) })
    ];
    expect(S.clusterItems(items)[0].lead.id).toBe('first');
  });

  it('leaves an uncluster-ed group split, every row standing alone', () => {
    const items = [item('a', { cluster: 'c' }), item('b', { cluster: 'c' })];
    const out = S.clusterItems(items, ['c']);
    expect(out).toHaveLength(2);
    expect(out.every(g => g.others.length === 0)).toBe(true);
  });

  it('only splits the cluster you asked about', () => {
    const items = [
      item('a', { cluster: 'c1' }), item('b', { cluster: 'c1' }),
      item('x', { cluster: 'c2' }), item('y', { cluster: 'c2' })
    ];
    const out = S.clusterItems(items, ['c1']);
    expect(out.filter(g => g.others.length)).toHaveLength(1);
  });

  it('never loses a row, however it is grouped', () => {
    const items = [item('a', { cluster: 'c' }), item('b', { cluster: 'c' }), item('c'), item('d', { cluster: 'z' })];
    for (const broken of [[], ['c'], ['c', 'z']]) {
      const seen = S.clusterItems(items, broken).flatMap(g => [g.lead, ...g.others]).map(i => i.id).sort();
      expect(seen).toEqual(['a', 'b', 'c', 'd']);
    }
  });

  it('copes with nothing at all', () => {
    expect(S.clusterItems([])).toEqual([]);
  });
});

describe('refreshPlan', () => {
  it('asks for the command when there is no token', () => {
    expect(S.refreshPlan({}).mode).toBe('manual');
    expect(S.refreshPlan({ githubRepo: 'me/arcade' }).mode).toBe('manual');
    expect(S.refreshPlan({ githubToken: 'x' }).mode).toBe('manual');
    expect(S.refreshPlan({}).command).toBe('npm run scrape');
  });
  it('dispatches once both are set, and names the repository', () => {
    const p = S.refreshPlan({ githubRepo: 'me/arcade', githubToken: 'x' });
    expect(p.mode).toBe('dispatch');
    expect(p.repo).toBe('me/arcade');
    expect(p.command).toContain('me/arcade');
  });
  it('treats whitespace as unset rather than building a broken URL', () => {
    expect(S.refreshPlan({ githubRepo: '  ', githubToken: '  ' }).mode).toBe('manual');
  });
});

describe('requestRefresh', () => {
  const settings = { githubRepo: 'me/arcade', githubToken: 'tok', githubBranch: 'main' };

  it('refuses to pretend when there is no token', async () => {
    const res = await S.requestRefresh({}, () => { throw new Error('should not be called'); });
    expect(res.ok).toBe(false);
    expect(res.mode).toBe('manual');
  });

  it('reports success only on GitHub 204', async () => {
    const res = await S.requestRefresh(settings, async () => ({ status: 204, text: async () => '' }));
    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/accepted/i);
  });

  it('sends the token in the header and nowhere else', async () => {
    let seen = { url: '', opts: /** @type {any} */ ({}) };
    await S.requestRefresh(settings, async (url, opts) => { seen = { url, opts }; return { status: 204, text: async () => '' }; });
    expect(seen.url).toBe('https://api.github.com/repos/me/arcade/actions/workflows/scrape.yml/dispatches');
    expect(seen.opts.headers.Authorization).toBe('Bearer tok');
    expect(seen.url).not.toContain('tok');
    expect(seen.opts.body).not.toContain('tok');
  });

  it('explains a refused token instead of saying it worked', async () => {
    const res = await S.requestRefresh(settings, async () => ({ status: 403, text: async () => 'no' }));
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/actions:write/);
  });

  it('survives the network being down', async () => {
    const res = await S.requestRefresh(settings, async () => { throw new Error('offline'); });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/offline/);
  });
});

describe('receipt wording', () => {
  const now = Date.UTC(2026, 5, 10, 12, 0, 0);
  it('says NEVER rather than inventing a date', () => {
    expect(ago(null, now)).toBe('NEVER');
  });
  it('scales the words with the age', () => {
    expect(ago(now - 10 * 60000, now)).toBe('WITHIN THE HOUR');
    expect(ago(now - 5 * HOUR, now)).toBe('5H AGO');
    expect(ago(now - 1 * DAY, now)).toBe('YESTERDAY');
    expect(ago(now - 9 * DAY, now)).toBe('9D AGO');
  });
  it('does not pretend a future timestamp is an age', () => {
    expect(ago(now + DAY, now)).toBe('IN THE FUTURE');
  });
});

describe('freshness', () => {
  const now = Date.now();
  it('is unknown when nothing ever checked it', () => {
    expect(freshness({ id: 'x' }, now).level).toBe('unknown');
  });
  it('grades a row by when it was last confirmed, not when it was written', () => {
    expect(freshness({ lastSeen: iso(now - 2 * HOUR) }, now).level).toBe('fresh');
    expect(freshness({ lastSeen: iso(now - 3 * DAY) }, now).level).toBe('aging');
    expect(freshness({ lastSeen: iso(now - 30 * DAY) }, now).level).toBe('stale');
  });
  it('calls a long-unchecked row stale even if it was reported today', () => {
    const f = freshness({ firstSeen: iso(now), lastSeen: iso(now - 20 * DAY) }, now);
    expect(f.level).toBe('stale');
    expect(f.label).toMatch(/NOT CHECKED SINCE/);
  });
});
