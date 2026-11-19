/* The share payload: what leaves this machine when you send someone a link.
 *
 * Everything in this file exists to make one promise keepable: a share contains what you chose and
 * nothing else. So the payload is **built by allowlist**, never by copying a record and deleting
 * the private parts. A field that nobody wrote into `sections` cannot appear, however the data
 * shifts underneath. Applications are not merely excluded — there is no branch that can read them.
 *
 * The encoding is gzip then base64url, using the browser's own CompressionStream. No library.
 */

export const SHARE_VERSION = 1;

/* Things that must never survive into a payload, whatever the user typed into a note or a goal. */
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
/* A street address is not reliably detectable; this catches the common shape and the rest is the
   custom redaction list. The preview shows exactly what was masked so nothing is silent. */
const ADDRESS = /\b\d{1,5}\s+[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){0,4}\s+(?:road|rd|street|st|avenue|ave|lane|ln|drive|dr|marg|nagar|colony|society|block|sector|flat|apartment|apt)\b\.?/gi;
export const MASK = '██';

/** @returns {{text: string, hits: string[]}} */
export function redactText(input, custom = []) {
  let text = String(input ?? '');
  const hits = [];
  const sweep = (re, label) => {
    text = text.replace(re, m => { hits.push(`${label}: ${m.trim().slice(0, 24)}`); return MASK; });
  };
  sweep(EMAIL, 'email');
  sweep(PHONE, 'phone number');
  sweep(ADDRESS, 'address');
  for (const word of custom) {
    const w = String(word || '').trim();
    if (!w) continue;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    text = text.replace(re, () => { hits.push(`your word: ${w}`); return MASK; });
  }
  return { text, hits };
}

/** Source links default to the domain alone: enough to judge a source, not enough to track one. */
export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export const DEFAULT_CHOICES = {
  motivation: false, goals: false, memories: false, pinned: false, random: false,
  trophies: false, journey: false, note: null, goal: null
};
export const DEFAULT_REDACTION = { urls: 'domain', noteBody: false, custom: [] };
export const DEFAULT_STYLE = { material: 'cork', theme: 'dark-room', accent: 'gold' };
export const EXPIRY_CHOICES = [
  { label: '1 DAY', days: 1 }, { label: '7 DAYS', days: 7 },
  { label: '30 DAYS', days: 30 }, { label: 'NEVER', days: null }
];

/**
 * Build the payload. `source` is everything this machine knows; `choices` is what the user ticked.
 * Nothing is read from `source` unless a choice asks for it.
 *
 * @param {{pins?: any[], goals?: any[], personal?: any[], notes?: any[], days?: string[]}} source
 */
export function buildPayload(source, {
  choices = DEFAULT_CHOICES,
  redaction = DEFAULT_REDACTION,
  style = DEFAULT_STYLE,
  header = /** @type {{name?: string, tagline?: string}} */ ({}),
  expiryDays = 7,
  now = Date.now()
} = {}) {
  const pins = source.pins || [];
  const goals = source.goals || [];
  const personal = source.personal || [];
  const notes = source.notes || [];
  const red = { ...DEFAULT_REDACTION, ...redaction };
  const allHits = [];

  const clean = s => {
    const r = redactText(s, red.custom);
    allHits.push(...r.hits);
    return r.text;
  };
  const zone = name => pins.filter(p => p.zone === name && p.type === 'text').map(p => clean(p.content));

  /** @type {Record<string, any>} */
  const sections = {};
  const included = [], redacted = ['applications (always)', 'emails', 'phone numbers', 'addresses'];

  if (choices.motivation) { sections.motivation = zone('MOTIVATION'); included.push('wall: motivation'); }
  if (choices.memories) { sections.memories = zone('MEMORIES'); included.push('wall: memories'); }
  if (choices.random) { sections.random = zone('RANDOM'); included.push('wall: random'); }

  if (choices.goals) {
    sections.goals = goals.map(g => {
      const out = {
        title: clean(g.title),
        done: (g.checkpoints || []).filter(c => c.done).length,
        total: (g.checkpoints || []).length,
        gold: !!g.gold
      };
      // Checkpoints are the working detail of a goal, so they are off unless asked for.
      if (choices.goalCheckpoints) out.checkpoints = (g.checkpoints || []).map(c => clean(c.text));
      return out;
    });
    included.push(choices.goalCheckpoints ? 'wall: goals, with checkpoints' : 'wall: goals, progress only');
    if (!choices.goalCheckpoints) redacted.push('goal checkpoints');
  }

  if (choices.pinned) {
    const ids = new Set(pins.filter(p => p.type === 'item_ref').map(p => p.content));
    sections.pinned = personal
      .filter(p => ids.has(p.id) && p.snapshot)
      .map(p => {
        const row = { title: clean(p.snapshot.title) };
        if (p.snapshot.org) row.org = clean(p.snapshot.org);
        if (red.urls === 'domain') { const d = domainOf(p.snapshot.url); if (d) row.domain = d; }
        return row;
      });
    included.push('wall: pinned items');
    if (red.urls !== 'full') redacted.push('source links (domain only)');
  }

  if (choices.trophies) {
    sections.trophies = goals.filter(g => g.gold).length
      + personal.filter(p => p.state === 'DONE').length;
    included.push('trophies');
  }

  if (choices.journey) {
    sections.journey = {
      daysActive: (source.days || []).length,
      itemsSaved: personal.filter(p => p.state && p.state !== 'SEEN').length,
      goalsHit: goals.filter(g => g.gold).length
    };
    included.push('journey numbers');
  }

  if (choices.note) {
    const n = notes.find(x => x.id === choices.note);
    if (n) {
      sections.note = { title: clean(n.title) };
      if (red.noteBody) { sections.note.body = clean(n.body_md); included.push('one note, in full'); }
      else { included.push('one note, title only'); redacted.push('note body'); }
    }
  }

  if (choices.goal) {
    const g = goals.find(x => x.id === choices.goal);
    if (g) {
      sections.goals = [{
        title: clean(g.title),
        done: (g.checkpoints || []).filter(c => c.done).length,
        total: (g.checkpoints || []).length,
        gold: !!g.gold
      }];
      included.push('one goal');
    }
  }

  const payload = {
    v: SHARE_VERSION,
    createdAt: now,
    expiresAt: expiryDays == null ? null : now + expiryDays * 864e5,
    style: { ...DEFAULT_STYLE, ...style },
    sections,
    redactionReport: {
      included: included.length ? included : ['nothing yet'],
      redacted: [...new Set([...redacted, ...allHits.map(h => h.split(':')[0] + ' found and masked')])]
    }
  };
  if (header.name) payload.header = { name: clean(header.name) };
  if (header.tagline) payload.header = { ...(payload.header || {}), tagline: clean(header.tagline) };
  return payload;
}

/* ---------- encoding: gzip, then base64url, using the browser's own compression ---------- */

const toB64url = bytes => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = str => {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

async function gzip(text) {
  const data = new TextEncoder().encode(text);
  if (typeof CompressionStream === 'undefined') return data;      // still works, just bigger
  const cs = new CompressionStream('gzip');
  const w = cs.writable.getWriter();
  const written = w.write(data).then(() => w.close());
  written.catch(() => {});                                        // reported by the read below
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function gunzip(bytes) {
  if (typeof DecompressionStream === 'undefined') return new TextDecoder().decode(bytes);
  try {
    const ds = new DecompressionStream('gzip');
    const w = ds.writable.getWriter();
    // Bytes that are not gzip make BOTH sides reject. Swallow the writer's copy of the same
    // failure here, or it surfaces as an unhandled rejection while the catch below handles it.
    w.write(bytes).then(() => w.close()).catch(() => {});
    return await new Response(ds.readable).text();
  } catch {
    return new TextDecoder().decode(bytes);                        // was not gzipped
  }
}

export async function encodePayload(payload) {
  return toB64url(await gzip(JSON.stringify(payload)));
}

/** @returns {Promise<{ok: boolean, payload?: object, why?: string}>} */
export async function decodePayload(encoded) {
  try {
    const text = await gunzip(fromB64url(String(encoded || '')));
    const payload = JSON.parse(text);
    if (payload?.v !== SHARE_VERSION) return { ok: false, why: 'This link was made by a different version.' };
    if (!payload.sections || typeof payload.sections !== 'object') return { ok: false, why: 'This link is invalid or corrupted.' };
    return { ok: true, payload };
  } catch {
    return { ok: false, why: 'This link is invalid or corrupted.' };
  }
}

export const isExpired = (payload, now = Date.now()) =>
  !!payload?.expiresAt && payload.expiresAt < now;

/** A token for a hosted share file. Not derived from anything guessable. */
export function shareToken() {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return toB64url(b).slice(0, 16);
}
