/* SHARES — every link you made, and how to stop it.
 *
 * The honest part of this page is the difference between the two kinds. A link that carries its own
 * payload cannot be un-sent: it can only run out. A hosted file can truly be revoked, by deleting
 * it. The page says which is which rather than offering a Revoke button that quietly does nothing.
 */

import * as S from '../store.js';
import { isExpired } from '../share/payload.js';

export const title = 'SHARES';
export const keys = [];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const day = t => (t ? new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');

export async function render(ctx) {
  const wrap = el('div');
  const h = el('div', 'hdr'); h.innerHTML = '<h1 class="t-display">SHARES</h1>';
  const make = el('button', 'btn is-primary t-small', '+ NEW SHARE');
  make.onclick = () => { ctx.SFX.click(); ctx.go('share'); };
  h.append(make);
  wrap.append(h);

  wrap.append(Object.assign(el('p', 'creed t-small',
    'THIS LIST LIVES ON THIS MACHINE. IT IS WHAT YOU MADE, NOT WHAT ANYONE HAS OPENED — '
    + 'NOTHING REPORTS BACK, BY DESIGN.'), {}));

  const host = el('div');
  wrap.append(host);

  async function draw() {
    host.innerHTML = '';
    const rows = (await S.all('meta'))
      .filter(r => r.id.startsWith('share-'))
      .map(r => ({ id: r.id, ...r.v }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (!rows.length) {
      host.append(el('p', 'empty t-body',
        'No shares yet. Build one and it is listed here with its expiry.'));
      return;
    }

    for (const r of rows) {
      const card = el('article', 'slot corner-1 bevel');
      const head = el('div', 'slot-head');
      head.append(el('span', 'role t-label', r.kind === 'file' ? 'HOSTED FILE' : 'LINK'));
      const dead = isExpired(r);
      head.append(el('span', 'co t-small', dead ? 'EXPIRED' : `EXPIRES ${day(r.expiresAt).toUpperCase()}`));
      const tag = el('span', `trust t-small ${dead ? 'tr-external' : 'tr-manual'}`, dead ? 'OVER' : 'LIVE');
      head.append(tag);
      card.append(head);

      card.append(el('p', 't-small', `MADE ${day(r.createdAt).toUpperCase()}`));
      if (r.included?.length) card.append(el('p', 't-small', 'CARRIES: ' + r.included.join(', ').toUpperCase()));

      const row = el('div', 'slot-foot');
      if (r.kind === 'link') {
        const copy = el('button', 'btn t-small', 'COPY LINK');
        copy.onclick = async () => {
          try { await navigator.clipboard.writeText(r.url || ''); ctx.toast('LINK COPIED', 'is-ghost'); }
          catch { ctx.toast('CLIPBOARD REFUSED', 'is-orange'); }
        };
        const open = el('button', 'btn is-ghost t-small', 'PREVIEW');
        open.onclick = () => { location.href = r.url; };
        row.append(copy, open);
        card.append(Object.assign(el('p', 'sb-warn t-small',
          'THIS KIND CANNOT BE REVOKED. IT CARRIES ITS OWN CONTENTS, SO IT STOPS WORKING ONLY WHEN IT EXPIRES.'), {}));
      } else {
        card.append(Object.assign(el('p', 't-small',
          `TO REVOKE: ${String(r.revokeBy || '').toUpperCase()}`), { style: 'color:var(--lime)' }));
      }

      const forget = el('button', 'btn is-ghost t-small', 'FORGET THIS ROW');
      forget.title = 'Removes it from this list. It does not revoke anything.';
      forget.onclick = async () => { await S.del('meta', r.id); ctx.SFX.del(); draw(); };
      row.append(forget);
      card.append(row);
      host.append(card);
    }
  }

  await draw();
  return wrap;
}
