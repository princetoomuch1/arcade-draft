/* APPLICATIONS — stage 5. A log of what you applied to and what happened.
   Every row is MANUAL (you typed it) and EXTERNAL (the application itself happens on the other site).
   Nothing here applies for you. */

import { put, all, del } from '../store.js';

export const title = 'APPLICATIONS';
export const keys = [];

const STATUSES = ['PLANNED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'GHOSTED'];
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const uid = () => 'a-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const safeUrl = u => { try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? p.href : null; } catch { return null; } };

export async function render(ctx) {
  const wrap = el('div');
  let rows = await all('apps');
  const saved = (await all('personal')).filter(p => p.snapshot && ['SAVED', 'PLANNED', 'PINNED'].includes(p.state));

  const h = el('div', 'hdr'); h.innerHTML = '<h1 class="t-display">APPLICATIONS</h1>';
  wrap.append(h);
  wrap.append(el('p', 'empty t-small', 'MANUAL: you log these yourself. EXTERNAL: you apply on the other site. Nothing auto-applies.'));

  /* ---- add form ---- */
  const form = el('div', 'form-row');
  const pick = el('select', 'field');
  pick.append(new Option('— from a saved item —', ''));
  saved.forEach(p => pick.append(new Option(p.snapshot.title, p.id)));
  const ttl = el('input', 'field'); ttl.placeholder = 'role / title';
  const org = el('input', 'field'); org.placeholder = 'company';
  const url = el('input', 'field'); url.placeholder = 'link (https://…)';
  pick.onchange = () => {
    const p = saved.find(s => s.id === pick.value); if (!p) return;
    ttl.value = p.snapshot.title || ''; org.value = p.snapshot.org || ''; url.value = p.snapshot.url || '';
  };
  const add = el('button', 'btn is-primary t-small', '+ LOG IT');
  add.onclick = async () => {
    if (!ttl.value.trim()) { ttl.focus(); ctx.toast('NEEDS A TITLE', 'is-orange'); return; }
    const link = url.value.trim() ? safeUrl(url.value.trim()) : null;
    if (url.value.trim() && !link) { ctx.toast('LINK MUST START WITH HTTP', 'is-orange'); return; }
    await put('apps', { id: uid(), itemId: pick.value || null, title: ttl.value.trim(), org: org.value.trim(),
                        url: link, status: 'PLANNED', appliedOn: null, note: '', updated: Date.now() });
    ttl.value = org.value = url.value = ''; pick.value = '';
    ctx.SFX.save(); await refresh();
  };
  form.append(pick, ttl, org, url, add);
  wrap.append(form);

  const tally = el('div', 'tally t-small');
  const host = el('div');
  wrap.append(tally, host);

  async function refresh() { rows = await all('apps'); draw(); }

  function draw() {
    tally.innerHTML = '';
    for (const s of STATUSES) {
      const n = rows.filter(r => r.status === s).length;
      const sp = el('span', '', s + ' '); const b = el('b', '', String(n)); sp.append(b); tally.append(sp);
    }
    host.innerHTML = '';
    if (!rows.length) { host.append(el('p', 'empty t-body', 'Nothing logged yet. Log what you applied to so you can see what is going nowhere.')); return; }

    const tbl = el('table', 'app-table');
    const head = el('tr');
    ['ROLE', 'COMPANY', 'STATUS', 'APPLIED', ''].forEach(x => head.append(el('th', 't-small', x)));
    tbl.append(head);

    for (const r of [...rows].sort((a, b) => b.updated - a.updated)) {
      const tr = el('tr');
      const roleTd = el('td', 't-body');
      if (r.url) { const a = el('a', '', r.title); a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.color = 'var(--cyan)'; roleTd.append(a); }
      else roleTd.textContent = r.title;
      roleTd.append(el('br'), Object.assign(el('span', 't-small'), { textContent: 'MANUAL · EXTERNAL', style: 'color:var(--muted)' }));

      const stTd = el('td');
      const sel = el('select', 'field t-small');
      STATUSES.forEach(s => sel.append(new Option(s, s)));
      sel.value = r.status; sel.style.minWidth = 'calc(30*var(--u))';
      sel.onchange = async () => {
        r.status = sel.value; r.updated = Date.now();
        if (r.status === 'APPLIED' && !r.appliedOn) r.appliedOn = new Date().toISOString().slice(0, 10);
        await put('apps', r); ctx.SFX.click(); await refresh();
      };
      stTd.append(sel);

      const dateTd = el('td', 't-body');
      const di = el('input', 'field'); di.type = 'date'; di.value = r.appliedOn || ''; di.style.minWidth = 'calc(48*var(--u))';
      di.onchange = async () => { r.appliedOn = di.value || null; r.updated = Date.now(); await put('apps', r); };
      dateTd.append(di);

      const delTd = el('td');
      const d = el('button', 'btn is-ghost t-small', 'DEL');
      d.onclick = async () => {
        if (d.dataset.armed !== '1') { d.dataset.armed = '1'; d.textContent = 'SURE?'; return; }
        await del('apps', r.id); ctx.SFX.del(); await refresh();
      };
      delTd.append(d);

      tr.append(roleTd, el('td', 't-body', r.org || '—'), stTd, dateTd, delTd);
      tbl.append(tr);
    }
    host.append(tbl);
  }

  draw();
  return wrap;
}
