/* The share view: what the recipient sees.
 *
 * This is the one surface in the whole app that is NOT desktop-only. A share link is opened from a
 * message, usually on a phone, and a link that looks broken to every recipient is not a share
 * feature. So this view is laid out in CSS pixels and ordinary units, not in u, and it reflows.
 *
 * It renders from the payload alone. It never opens IndexedDB, never calls a network, and has no
 * controls that change anything.
 */

import { isExpired } from './payload.js';

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const day = t => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** The calm end of an expired link: a date, no data, and no guilt. */
export function expiredNode(payload) {
  const box = el('div', 'sv-expired');
  box.append(el('h1', 'sv-h1', 'This share has expired'));
  box.append(el('p', 'sv-p', payload?.expiresAt
    ? `It was set to run out on ${day(payload.expiresAt)}.`
    : 'It is no longer available.'));
  const who = payload?.header?.name;
  box.append(el('p', 'sv-muted', who ? `Ask ${who} for a fresh link.` : 'Ask whoever sent it for a fresh link.'));
  return box;
}

export function invalidNode(why) {
  const box = el('div', 'sv-expired');
  box.append(el('h1', 'sv-h1', 'This link did not open'));
  box.append(el('p', 'sv-p', why || 'This link is invalid or corrupted.'));
  return box;
}

/**
 * @param {object} payload
 * @param {{preview?: boolean}} [opts] preview adds the privacy panel; the real view never shows it
 */
export function shareNode(payload, opts = {}) {
  if (!payload) return invalidNode();
  if (isExpired(payload)) return expiredNode(payload);

  const s = payload.sections || {};
  const style = payload.style || {};
  const root = el('div', `sv sv-${style.theme || 'dark-room'} sv-accent-${style.accent || 'gold'}`);
  root.dataset.material = style.material || 'cork';

  /* header */
  const head = el('header', 'sv-head');
  head.append(el('div', 'sv-rule'));
  const name = payload.header?.name;
  head.append(el('h1', 'sv-h1', name ? `★ ${name}’s corner` : '★ A corner of someone’s journey'));
  if (payload.header?.tagline) head.append(el('p', 'sv-tag', payload.header.tagline));
  head.append(el('p', 'sv-muted', day(payload.createdAt || Date.now())));
  head.append(el('div', 'sv-rule'));
  root.append(head);

  const section = (title, node) => {
    const sec = el('section', 'sv-sec');
    sec.append(el('h2', 'sv-h2', title));
    sec.append(node);
    root.append(sec);
  };
  const quoteList = (items, cls) => {
    const box = el('div', cls);
    for (const t of items) box.append(el('p', 'sv-quote', t));
    return box;
  };

  if (s.motivation?.length) section('Motivation', quoteList(s.motivation, 'sv-quotes'));

  if (s.goals?.length) {
    const box = el('div', 'sv-goals');
    for (const g of s.goals) {
      const card = el('article', 'sv-goal' + (g.gold ? ' is-gold' : ''));
      card.append(el('h3', 'sv-h3', g.title));
      const bar = el('div', 'sv-bar');
      const fill = el('i');
      fill.style.width = g.total ? `${Math.round(g.done / g.total * 100)}%` : '0%';
      bar.append(fill);
      card.append(bar);
      card.append(el('p', 'sv-muted', g.total ? `${g.done} of ${g.total} done` : 'no checkpoints'));
      if (g.checkpoints?.length) {
        const ul = el('ul', 'sv-cps');
        g.checkpoints.forEach((c, i) => {
          const li = el('li', i < g.done ? 'is-done' : '', c);
          ul.append(li);
        });
        card.append(ul);
      }
      box.append(card);
    }
    section('Goals', box);
  }

  if (s.memories?.length) section('Memories', quoteList(s.memories, 'sv-quotes'));

  if (s.pinned?.length) {
    const box = el('div', 'sv-pins');
    for (const p of s.pinned) {
      const card = el('article', 'sv-pin');
      card.append(el('h3', 'sv-h3', p.title));
      const meta = [p.org, p.domain].filter(Boolean).join(' · ');
      if (meta) card.append(el('p', 'sv-muted', meta));
      box.append(card);
    }
    section('Pinned', box);
  }

  if (s.random?.length) section('Random', quoteList(s.random, 'sv-quotes'));

  if (s.note) {
    const box = el('div', 'sv-note');
    box.append(el('h3', 'sv-h3', s.note.title));
    if (s.note.body) box.append(el('p', 'sv-body', s.note.body));
    else box.append(el('p', 'sv-muted', 'Title only — the body was kept private.'));
    section('A note', box);
  }

  if (typeof s.trophies === 'number' && s.trophies > 0) {
    const box = el('div', 'sv-trophies');
    for (let i = 0; i < Math.min(s.trophies, 12); i++) box.append(el('span', 'sv-trophy'));
    box.append(el('span', 'sv-muted', `${s.trophies} finished`));
    section('Trophies', box);
  }

  if (s.journey) {
    const box = el('div', 'sv-journey');
    for (const [k, v] of [
      ['Days shown up', s.journey.daysActive],
      ['Things saved', s.journey.itemsSaved],
      ['Goals finished', s.journey.goalsHit]
    ]) {
      const cell = el('div', 'sv-stat');
      cell.append(el('b', '', String(v ?? 0)), el('span', '', k));
      box.append(cell);
    }
    section('The journey so far', box);
  }

  if (!Object.keys(s).length) {
    root.append(el('p', 'sv-muted', 'Nothing was chosen for this share.'));
  }

  /* The privacy panel is a builder-time thing. The recipient never sees it. */
  if (opts.preview && payload.redactionReport) {
    const panel = el('aside', 'sv-privacy');
    panel.append(el('h2', 'sv-h2', 'What this link carries'));
    const inc = el('div', 'sv-priv-col');
    inc.append(el('h3', 'sv-h3', 'Included'));
    for (const i of payload.redactionReport.included) inc.append(el('p', 'sv-ok', i));
    const red = el('div', 'sv-priv-col');
    red.append(el('h3', 'sv-h3', 'Kept out'));
    for (const i of payload.redactionReport.redacted) red.append(el('p', 'sv-no', i));
    panel.append(inc, red);
    root.append(panel);
  }

  const foot = el('footer', 'sv-foot');
  foot.append(el('div', 'sv-rule'));
  foot.append(el('p', 'sv-muted',
    `Made with Career Arcade · ${day(payload.createdAt || Date.now())}`
    + (payload.expiresAt ? ` · expires ${day(payload.expiresAt)}` : ' · no expiry set')));
  root.append(foot);
  return root;
}

/** The same content as plain Markdown, for pasting anywhere. */
export function toMarkdown(payload) {
  const s = payload.sections || {};
  const out = [];
  out.push(`# ${payload.header?.name ? payload.header.name + "'s corner" : 'A corner of someone’s journey'}`);
  if (payload.header?.tagline) out.push(`_${payload.header.tagline}_`);
  out.push('');
  if (s.goals?.length) {
    out.push('## Goals', '');
    for (const g of s.goals) {
      out.push(`- **${g.title}** — ${g.done}/${g.total}${g.gold ? ' — done' : ''}`);
      for (const c of g.checkpoints || []) out.push(`  - ${c}`);
    }
    out.push('');
  }
  for (const [key, title] of [['motivation', 'Motivation'], ['memories', 'Memories'], ['random', 'Random']]) {
    if (s[key]?.length) { out.push(`## ${title}`, ''); for (const t of s[key]) out.push(`> ${t}`); out.push(''); }
  }
  if (s.pinned?.length) {
    out.push('## Pinned', '');
    for (const p of s.pinned) out.push(`- ${p.title}${p.org ? ` — ${p.org}` : ''}${p.domain ? ` (${p.domain})` : ''}`);
    out.push('');
  }
  if (s.note) { out.push('## A note', '', `**${s.note.title}**`, s.note.body || '_title only_', ''); }
  if (typeof s.trophies === 'number') out.push(`**Trophies:** ${s.trophies}`, '');
  if (s.journey) {
    out.push('## The journey so far', '',
      `- Days shown up: ${s.journey.daysActive}`,
      `- Things saved: ${s.journey.itemsSaved}`,
      `- Goals finished: ${s.journey.goalsHit}`, '');
  }
  out.push('---', `Made with Career Arcade · ${day(payload.createdAt || Date.now())}`);
  return out.join('\n');
}
