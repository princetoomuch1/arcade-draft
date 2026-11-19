import { describe, it, expect } from 'vitest';
import {
  buildPayload, redactText, domainOf, encodePayload, decodePayload,
  isExpired, shareToken, SHARE_VERSION, MASK, DEFAULT_CHOICES
} from '../src/share/payload.js';

const DAY = 864e5;

/* Everything this machine knows, including plenty that must never leave it. */
const source = () => ({
  days: ['2026-01-01', '2026-01-02', '2026-01-03'],
  pins: [
    { id: 'p1', type: 'text', zone: 'MOTIVATION', content: 'ship something small every week' },
    { id: 'p2', type: 'text', zone: 'MEMORIES', content: 'first demo, reach me on riya@example.com' },
    { id: 'p3', type: 'text', zone: 'RANDOM', content: 'call me on +91 98765 43210' },
    { id: 'p4', type: 'item_ref', zone: 'PINNED FROM DESK', content: 'rec1' }
  ],
  goals: [
    { id: 'g1', title: 'Win a hackathon', gold: true,
      checkpoints: [{ text: 'pick an event', done: true }, { text: 'email priya@firm.co.in', done: true }] },
    { id: 'g2', title: 'Learn Rust', gold: false, checkpoints: [{ text: 'read the book', done: false }] }
  ],
  personal: [
    { id: 'rec1', state: 'SAVED', snapshot: { title: 'Backend intern', org: 'Acme', url: 'https://jobs.acme.test/listing/9912?ref=me' } },
    { id: 'rec2', state: 'DONE', snapshot: { title: 'Finished thing', url: 'https://x.test/1' } },
    { id: 'rec3', state: 'SEEN', snapshot: { title: 'Never touched', url: 'https://y.test/2' } }
  ],
  notes: [
    { id: 'n1', title: 'Canary rollouts', body_md: 'secret plan, ping me at me@home.net or 020 7946 0958' }
  ],
  /* These exist on the machine and must never be reachable from a payload. */
  apps: [
    { id: 'a1', title: 'Backend intern', org: 'Acme', stage: 'interview', contact: 'hr@acme.test',
      notes: 'they asked about salary', dates: [{ stage: 'applied', at: 1 }] }
  ]
});

const everything = {
  motivation: true, goals: true, goalCheckpoints: true, memories: true, pinned: true,
  random: true, trophies: true, journey: true, note: 'n1', goal: null
};

describe('redactText', () => {
  it('masks an email, a phone number and a street address', () => {
    const r = redactText('write to me@x.com or ring +91 98765 43210, I am at 12 Nehru Road');
    expect(r.text).not.toMatch(/me@x\.com/);
    expect(r.text).not.toMatch(/98765/);
    expect(r.text).not.toMatch(/Nehru Road/i);
    expect(r.text).toContain(MASK);
    expect(r.hits.length).toBeGreaterThanOrEqual(3);
  });

  it('masks the user’s own custom words, case-insensitively', () => {
    const r = redactText('Project Bluebird is the codename', ['bluebird']);
    expect(r.text).not.toMatch(/bluebird/i);
    expect(r.hits.join(' ')).toContain('bluebird');
  });

  it('leaves ordinary writing alone', () => {
    const r = redactText('I built a small thing and it worked');
    expect(r.text).toBe('I built a small thing and it worked');
    expect(r.hits).toEqual([]);
  });

  it('survives null and empty input', () => {
    expect(redactText(null).text).toBe('');
    expect(redactText('').hits).toEqual([]);
  });
});

describe('domainOf', () => {
  it('keeps the domain and drops the path, query and www', () => {
    expect(domainOf('https://www.jobs.acme.test/listing/9912?ref=me')).toBe('jobs.acme.test');
  });
  it('returns nothing for junk rather than throwing', () => {
    expect(domainOf('not a url')).toBe('');
  });
});

describe('the payload includes only what was chosen', () => {
  it('is empty when nothing is ticked', () => {
    const p = buildPayload(source(), { choices: DEFAULT_CHOICES });
    expect(p.sections).toEqual({});
    expect(p.redactionReport.included).toEqual(['nothing yet']);
  });

  it('carries a section only when its box is ticked', () => {
    const p = buildPayload(source(), { choices: { ...DEFAULT_CHOICES, motivation: true } });
    expect(p.sections.motivation).toHaveLength(1);
    expect(p.sections.goals).toBeUndefined();
    expect(p.sections.journey).toBeUndefined();
    expect(p.sections.pinned).toBeUndefined();
  });

  it('shows goal progress without checkpoints unless they are asked for', () => {
    const off = buildPayload(source(), { choices: { ...DEFAULT_CHOICES, goals: true } });
    expect(off.sections.goals[0]).toMatchObject({ title: 'Win a hackathon', done: 2, total: 2, gold: true });
    expect(off.sections.goals[0].checkpoints).toBeUndefined();
    expect(off.redactionReport.redacted).toContain('goal checkpoints');

    const on = buildPayload(source(), { choices: { ...DEFAULT_CHOICES, goals: true, goalCheckpoints: true } });
    expect(on.sections.goals[0].checkpoints).toHaveLength(2);
  });

  it('counts the journey from real records, not from time spent anywhere', () => {
    const p = buildPayload(source(), { choices: { ...DEFAULT_CHOICES, journey: true } });
    expect(p.sections.journey).toEqual({ daysActive: 3, itemsSaved: 2, goalsHit: 1 });
    expect(JSON.stringify(p)).not.toMatch(/minutes|hours|session/i);
  });
});

/* ---- B7: the guarantees. These are the reason the feature is allowed to exist. ---- */
describe('privacy guarantees', () => {
  const full = () => buildPayload(source(), {
    choices: everything,
    redaction: { urls: 'domain', noteBody: true, custom: [] },
    header: { name: 'Riya', tagline: 'building things' }
  });

  it('never carries an application, even with every box ticked', () => {
    const text = JSON.stringify(full());
    expect(text).not.toMatch(/hr@acme\.test/);
    expect(text).not.toMatch(/they asked about salary/);
    expect(text).not.toMatch(/interview/i);
    expect(text).not.toMatch(/"stage"/);
  });

  it('never carries an email, a phone number or an address, from any section', () => {
    const text = JSON.stringify(full());
    expect(text).not.toMatch(/riya@example\.com/);
    expect(text).not.toMatch(/priya@firm\.co\.in/);
    expect(text).not.toMatch(/me@home\.net/);
    expect(text).not.toMatch(/98765 43210/);
    expect(text).not.toMatch(/020 7946 0958/);
  });

  it('keeps a note body out unless the note body switch is on', () => {
    const titleOnly = buildPayload(source(), { choices: { ...DEFAULT_CHOICES, note: 'n1' } });
    expect(titleOnly.sections.note).toEqual({ title: 'Canary rollouts' });
    expect(JSON.stringify(titleOnly)).not.toMatch(/secret plan/);
    expect(titleOnly.redactionReport.redacted).toContain('note body');
  });

  it('reduces a source link to its domain, losing the path and the tracking query', () => {
    const p = full();
    expect(p.sections.pinned[0].domain).toBe('jobs.acme.test');
    const text = JSON.stringify(p);
    expect(text).not.toMatch(/listing\/9912/);
    expect(text).not.toMatch(/ref=me/);
  });

  it('carries no internal ids that could be guessed or correlated', () => {
    const text = JSON.stringify(full());
    for (const id of ['rec1', 'rec2', 'rec3', 'g1', 'g2', 'n1', 'p1', 'p4', 'a1']) {
      expect(text).not.toContain(`"${id}"`);
    }
  });

  it('reports honestly what it included and what it masked', () => {
    const r = full().redactionReport;
    expect(r.included.join(' ')).toMatch(/motivation/);
    expect(r.redacted).toContain('applications (always)');
    expect(r.redacted.join(' ')).toMatch(/email/);
  });

  it('redacts the header too, so a tagline cannot smuggle anything out', () => {
    const p = buildPayload(source(), { choices: DEFAULT_CHOICES, header: { name: 'Riya', tagline: 'reach me at a@b.com' } });
    expect(JSON.stringify(p)).not.toMatch(/a@b\.com/);
  });

  it('matches the share schema shape: no unexpected top-level keys', () => {
    const keys = Object.keys(full()).sort();
    expect(keys).toEqual(['createdAt', 'expiresAt', 'header', 'redactionReport', 'sections', 'style', 'v'].sort());
  });
});

describe('encode and decode', () => {
  it('round-trips a payload', async () => {
    const p = buildPayload(source(), { choices: { ...DEFAULT_CHOICES, journey: true } });
    const out = await decodePayload(await encodePayload(p));
    expect(out.ok).toBe(true);
    expect(out.payload.sections.journey).toEqual(p.sections.journey);
  });

  it('produces a url-safe string with no padding', async () => {
    const s = await encodePayload(buildPayload(source(), { choices: everything }));
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('refuses junk with a plain message rather than throwing', async () => {
    for (const junk of ['', 'not-a-payload', '!!!!', 'eyJhIjoxfQ']) {
      const r = await decodePayload(junk);
      expect(r.ok).toBe(false);
      expect(r.why).toMatch(/invalid|corrupted|different version/i);
    }
  });

  it('refuses a payload from another version', async () => {
    const p = buildPayload(source(), { choices: DEFAULT_CHOICES });
    p.v = SHARE_VERSION + 1;
    const r = await decodePayload(await encodePayload(p));
    expect(r.ok).toBe(false);
    expect(r.why).toMatch(/different version/);
  });
});

describe('expiry', () => {
  const now = Date.now();
  it('defaults to seven days', () => {
    expect(buildPayload(source(), { choices: DEFAULT_CHOICES, now }).expiresAt).toBe(now + 7 * DAY);
  });
  it('honours a chosen length, and never expiring', () => {
    expect(buildPayload(source(), { choices: DEFAULT_CHOICES, expiryDays: 1, now }).expiresAt).toBe(now + DAY);
    expect(buildPayload(source(), { choices: DEFAULT_CHOICES, expiryDays: null, now }).expiresAt).toBe(null);
  });
  it('knows when a share has run out', () => {
    expect(isExpired({ expiresAt: now - 1 }, now)).toBe(true);
    expect(isExpired({ expiresAt: now + DAY }, now)).toBe(false);
    expect(isExpired({ expiresAt: null }, now)).toBe(false);
  });
});

describe('shareToken', () => {
  it('is url-safe and does not repeat', () => {
    const seen = new Set(Array.from({ length: 500 }, () => shareToken()));
    expect(seen.size).toBe(500);
    for (const t of seen) expect(t).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });
});
