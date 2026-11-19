/* APPLICATIONS — the save-file screen. UI Spec v2 section 10.6.
 *
 * One slot per application, read like a console save file: who, what stage, when it last moved,
 * what you do next. The trust label is never decoration. It says exactly how much this app knows:
 *   MANUAL    you logged it here
 *   EXTERNAL  you applied on the other site, which this app cannot see
 *   PLATFORM  a platform confirmed delivery — nothing here can set this
 * Nothing on this page ever says an employer received anything.
 */

import * as S from '../store.js';
import * as UNDO from '../undo.js';
import { companySprite } from '../sprites.js';
import { metrics } from '../u.js';

export const title = 'APPLICATIONS';
export const keys = [['N', 'NEW SLOT']];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const STAGES = S.STAGE_ORDER;
const STAGE_LABEL = {
  planned: 'PLANNED', applied: 'APPLIED', screen: 'SCREEN',
  interview: 'INTERVIEW', offer: 'OFFER', reject: 'CLOSED'
};
const safeUrl = u => { try { const p = new URL(u); return /^https?:$/.test(p.protocol) ? p.href : null; } catch { return null; } };
const day = t => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export async function render(ctx) {
  const wrap = el('div');
  let rows = await S.all('apps');
  let filter = 'OPEN';

  const saved = (await S.all('personal'))
    .filter(p => p.snapshot && ['SAVED', 'PLANNED', 'PINNED'].includes(p.state));

  const h = el('div', 'hdr');
  h.innerHTML = '<h1 class="t-display">APPLICATIONS</h1>';
  wrap.append(h);

  const creed = el('p', 'creed t-small');
  creed.textContent = 'NOTHING HERE APPLIES FOR YOU, AND NOTHING IS SENT FROM THIS APP. '
    + 'EVERY SLOT SAYS HOW IT GOT HERE.';
  wrap.append(creed);

  /* ---- tally + filter ---- */
  const tally = el('div', 'tally t-small');
  const filterRow = el('div', 'form-row');
  const host = el('div');

  /* ---- new slot ---- */
  const form = el('div', 'slot-form');
  const pick = el('select', 'field');
  pick.setAttribute('aria-label', 'Fill from a saved item');
  pick.append(new Option('— from a saved item —', ''));
  saved.forEach(p => pick.append(new Option(p.snapshot.title, p.id)));
  const ttl = el('input', 'field'); ttl.placeholder = 'role'; ttl.id = 'app-title';
  const org = el('input', 'field'); org.placeholder = 'company'; org.id = 'app-org';
  const url = el('input', 'field'); url.placeholder = 'link (https://…)'; url.id = 'app-url';
  pick.onchange = () => {
    const p = saved.find(s => s.id === pick.value); if (!p) return;
    ttl.value = p.snapshot.title || ''; org.value = p.snapshot.org || ''; url.value = p.snapshot.url || '';
  };
  const add = el('button', 'btn is-primary t-small', '+ NEW SLOT');
  add.onclick = async () => {
    if (!ttl.value.trim()) { ttl.focus(); ctx.toast('A SLOT NEEDS A ROLE', 'is-orange'); return; }
    const link = url.value.trim() ? safeUrl(url.value.trim()) : null;
    if (url.value.trim() && !link) { ctx.toast('LINK MUST START WITH HTTP', 'is-orange'); return; }
    await S.logApplication(null, {
      trust: 'manual', stage: 'planned', item_id: pick.value || null,
      title: ttl.value.trim(), org: org.value.trim(), url: link
    });
    ttl.value = org.value = url.value = ''; pick.value = '';
    ctx.SFX.save(); await refresh();
  };
  form.append(pick, ttl, org, url, add);
  wrap.append(form, tally, filterRow, host);

  async function refresh() { rows = await S.all('apps'); draw(); }

  function drawTally() {
    tally.innerHTML = '';
    for (const s of STAGES) {
      const n = rows.filter(r => r.stage === s).length;
      if (!n && s !== 'applied') continue;
      const sp = el('span', '', STAGE_LABEL[s] + ' ');
      sp.append(el('b', '', String(n)));
      tally.append(sp);
    }
    const silent = rows.filter(r => (S.daysSilent(r) ?? 0) >= 14).length;
    if (silent) {
      const sp = el('span', 'quiet', 'NO REPLY 14D+ ');
      sp.append(el('b', '', String(silent)));
      sp.title = 'Worked out from the dates on the slot. Nobody marked these as anything.';
      tally.append(sp);
    }
  }

  function drawFilter() {
    filterRow.innerHTML = '';
    for (const f of ['OPEN', 'ALL', 'CLOSED']) {
      const b = el('button', 'chip t-small' + (filter === f ? ' is-cyan' : ' is-ghost'), f);
      b.onclick = () => { filter = f; ctx.SFX.click(); draw(); };
      filterRow.append(b);
    }
  }

  /* ---- one save-file slot ---- */
  function slot(r) {
    const card = el('article', 'slot corner-1 bevel');
    const m = metrics(ctx.settings.density, innerWidth, innerHeight, devicePixelRatio || 1, ctx.frameNow());

    const sp = companySprite(r.org || r.title, 2 * m.uDev);
    sp.style.width = 'calc(16*var(--u))'; sp.style.height = 'calc(16*var(--u))';
    sp.className = 'slot-sprite';
    card.append(sp);

    const head = el('div', 'slot-head');
    if (r.url) {
      const a = el('a', 'role t-label', r.title);
      a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      head.append(a);
    } else head.append(el('span', 'role t-label', r.title));
    head.append(el('span', 'co t-small', String(r.org || 'NO COMPANY NAMED').toUpperCase()));

    const trust = el('span', `trust t-small tr-${r.trust}`, r.trust.toUpperCase());
    trust.title = S.TRUST_WORDS[r.trust];
    head.append(trust);
    card.append(head);

    /* the stage rail: every stage, the ones reached filled in */
    const reached = new Set((r.dates || []).map(d => d.stage));
    reached.add(r.stage);
    const rail = el('div', 'rail');
    for (const s of STAGES) {
      const b = el('button', 'pip t-small' + (reached.has(s) ? ' on' : '') + (r.stage === s ? ' now' : ''), STAGE_LABEL[s]);
      const when = (r.dates || []).find(d => d.stage === s);
      b.title = when ? `${STAGE_LABEL[s]} on ${day(when.at)}` : `Move this slot to ${STAGE_LABEL[s]}`;
      b.onclick = async () => {
        await S.setStage(r, s);
        s === 'offer' ? ctx.SFX.levelUp() : s === 'reject' ? ctx.SFX.back() : ctx.SFX.checkpoint();
        await refresh();
      };
      rail.append(b);
    }
    card.append(rail);

    /* history: only what actually happened, in the order it happened */
    const hist = el('div', 'hist t-small');
    if (!(r.dates || []).length) hist.append(el('span', '', 'NOTHING LOGGED YET'));
    for (const d of [...(r.dates || [])].sort((a, b) => a.at - b.at)) {
      hist.append(el('span', '', `${STAGE_LABEL[d.stage]} ${day(d.at)}`));
    }
    const silent = S.daysSilent(r);
    if (silent != null && silent >= 14) {
      const q = el('span', 'quiet', `NO REPLY FOR ${silent} DAYS`);
      q.title = 'Counted from the last date on this slot. It is not a status anyone set.';
      hist.append(q);
    }
    card.append(hist);

    /* next action: what you do, and when */
    const next = el('div', 'next');
    const na = el('input', 'field'); na.placeholder = 'next action'; na.value = r.next_action || '';
    na.id = 'na-' + r.id;
    na.onchange = async () => { r.next_action = na.value; r.updated = Date.now(); await S.put('apps', r); };
    const nd = el('input', 'field'); nd.type = 'date'; nd.id = 'nd-' + r.id;
    nd.value = r.next_action_at ? new Date(r.next_action_at).toISOString().slice(0, 10) : '';
    nd.onchange = async () => {
      r.next_action_at = nd.value ? new Date(nd.value + 'T12:00:00').getTime() : null;
      r.updated = Date.now(); await S.put('apps', r); await refresh();
    };
    next.append(el('span', 't-small', 'NEXT'), na, nd);
    card.append(next);

    /* materials and notes, both yours */
    const mats = el('div', 'mats t-small');
    mats.append(el('span', '', 'SENT:'));
    for (const mat of ['CV', 'COVER LETTER', 'PORTFOLIO', 'REFERENCES']) {
      const on = (r.materials || []).includes(mat);
      const b = el('button', 'chip t-small' + (on ? ' is-lime' : ' is-ghost'), mat);
      b.setAttribute('aria-pressed', String(on));
      b.onclick = async () => {
        const set = new Set(r.materials || []);
        set.has(mat) ? set.delete(mat) : set.add(mat);
        r.materials = [...set]; r.updated = Date.now();
        await S.put('apps', r); ctx.SFX.click(); await refresh();
      };
      mats.append(b);
    }
    card.append(mats);

    const note = el('textarea', 'field'); note.placeholder = 'notes, contact, what was said';
    note.value = r.notes || ''; note.id = 'note-' + r.id; note.rows = 2;
    note.onchange = async () => { r.notes = note.value; r.updated = Date.now(); await S.put('apps', r); };
    card.append(note);

    const foot = el('div', 'slot-foot');
    const del = el('button', 'btn is-ghost t-small', 'DELETE SLOT');
    del.onclick = async () => {
      if (del.dataset.armed !== '1') { del.dataset.armed = '1'; del.textContent = 'SURE? CLICK AGAIN'; return; }
      const back = await S.snapshotFor('apps', r.id);
      await S.del('apps', r.id); ctx.SFX.del(); await refresh();
      UNDO.record('deleted the slot ' + (r.title || r.id), async () => { await back(); await refresh(); });
      ctx.toast('SLOT DELETED', 'is-orange', { undo: true });
    };
    foot.append(el('span', 't-small', `UPDATED ${day(r.updated)}`), del);
    card.append(foot);
    return card;
  }

  function draw() {
    drawTally(); drawFilter();
    host.innerHTML = '';
    const closed = r => r.stage === 'reject' || r.stage === 'offer';
    const shown = rows.filter(r => filter === 'ALL' ? true : filter === 'CLOSED' ? closed(r) : !closed(r));

    if (!rows.length) {
      host.append(el('p', 'empty t-body',
        'No slots yet. Track a job from the Jobs page, or open one here. Logging it is how you find out '
        + 'later which of these went nowhere.'));
      return;
    }
    if (!shown.length) {
      host.append(el('p', 'empty t-body', `Nothing under ${filter}.`));
      return;
    }
    // soonest next action first, then whatever moved most recently
    shown.sort((a, b) => (a.next_action_at ?? Infinity) - (b.next_action_at ?? Infinity) || b.updated - a.updated);
    for (const r of shown) host.append(slot(r));
  }

  const onKey = e => { if (e.detail.key === 'n') { ttl.focus(); e.detail.raw?.preventDefault(); } };
  document.addEventListener('arcade:key', onKey);
  new MutationObserver((mu, o) => {
    if (!wrap.isConnected) { document.removeEventListener('arcade:key', onKey); o.disconnect(); }
  }).observe(document.getElementById('page'), { childList: true });

  draw();
  return wrap;
}
