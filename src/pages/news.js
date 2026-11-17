/* NEWS — "Newspaper Stand". UI Spec v2 section 11.2.
   Nothing is silently merged: a duplicate stack lists every source. A summary never replaces
   the original headline or the link to it. */

import { mark, bump, STATE } from '../store.js';
import { raggedEdge } from '../sprites.js';

export const title = 'News';
export const keys = [['SPACE','PAUSE TICKER']];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const ago = d => { const h = (Date.now() - new Date(d).getTime()) / 36e5;
  return h < 1 ? 'JUST NOW' : h < 48 ? `${Math.round(h)}H AGO` : `${Math.round(h / 24)}D AGO`; };

export async function render(ctx) {
  const wrap = el('div');
  let filterTag = null;
  let paused = false;

  const head = el('div', 'hdr');
  head.innerHTML = '<h1 class="t-display">NEWS</h1>';
  const ticker = el('div', 'ticker');
  const popular = el('div', 'popularrow');
  const clips = el('div', 'clips');
  wrap.append(head, ticker, popular, clips);

  const all = () => ctx.items.filter(it => it.type === 'news');

  /* ---- cluster: one lead item per cluster, the rest become its source rows.
          An item with no cluster stands alone. ---- */
  function clustered() {
    const byCluster = new Map(), solo = [];
    for (const it of all()) {
      if (!it.cluster) { solo.push({ lead: it, others: [] }); continue; }
      if (!byCluster.has(it.cluster)) byCluster.set(it.cluster, []);
      byCluster.get(it.cluster).push(it);
    }
    const groups = [...byCluster.values()].map(list => {
      const sorted = [...list].sort((a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime());
      return { lead: sorted[0], others: sorted.slice(1) };
    });
    let out = [...groups, ...solo].sort((a, b) => new Date(b.lead.firstSeen).getTime() - new Date(a.lead.firstSeen).getTime());
    if (filterTag) out = out.filter(g => (g.lead.skills || []).map(s => s.toLowerCase()).includes(filterTag));
    return out;
  }

  /* ---- 11.2 ticker: 1u per 50 ms, stepped. Pauses on hover, focus and the button.
          With reduced motion it does not scroll: one headline for 5 s, swapped by dither. ---- */
  function buildTicker() {
    ticker.innerHTML = '';
    const heads = all().map(it => it.title);
    if (!heads.length) { ticker.append(el('span', 't-small', ' no headlines in the data yet')); return; }

    const reduce = ctx.settings.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tape = el('div', 'tape t-small');
    ticker.append(tape);

    const btn = el('button', 'pausebtn t-small', reduce ? '■' : '‖');
    btn.setAttribute('aria-label', 'Pause the headline ticker');
    ticker.append(btn);

    if (reduce) {
      let i = 0;
      tape.textContent = '  ' + heads[0];
      const swap = () => { i = (i + 1) % heads.length; tape.style.opacity = '1'; tape.textContent = '  ' + heads[i]; };
      let t = setInterval(swap, 5000);
      btn.onclick = () => { paused = !paused; clearInterval(t); if (!paused) t = setInterval(swap, 5000); btn.textContent = paused ? '▶' : '■'; };
      stopHooks.push(() => clearInterval(t));
      return;
    }

    tape.textContent = '  ' + heads.join('   ·   ') + '   ·   ';
    let x = 0;
    const step = () => {
      if (paused) return;
      x -= 1;
      const width = tape.scrollWidth / 2 || 1;
      if (-x > width) x = 0;
      tape.style.transform = `translate3d(calc(${x} * var(--u)), 0, 0)`;
    };
    const t = setInterval(step, 50);            // 1u per 50 ms = 20u per second
    stopHooks.push(() => clearInterval(t));
    const hold = v => { paused = v; btn.textContent = v ? '▶' : '‖'; };
    ticker.onmouseenter = () => hold(true);
    ticker.onmouseleave = () => hold(false);
    ticker.onfocusin = () => hold(true);
    ticker.onfocusout = () => hold(false);
    btn.onclick = () => hold(!paused);
  }

  /* ---- popular row. Labelled, never called personal. ---- */
  function buildPopular() {
    popular.innerHTML = '';
    const counts = new Map();
    for (const it of all()) for (const s of it.skills || []) {
      const k = s.toLowerCase();
      counts.set(k, (counts.get(k) || 0) + (it.sourceCount || 1));
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const lab = el('span', 't-small', 'POPULAR THIS WEEK (NOT PERSONAL)');
    lab.style.color = 'var(--muted)';
    lab.title = 'Counted by how many sources carried it, not by what you read.';
    popular.append(lab);
    for (const [tag] of top) {
      const b = el('button', 'chip t-small' + (filterTag === tag ? ' is-cyan' : ' is-ghost'), '#' + tag);
      b.onclick = () => { filterTag = filterTag === tag ? null : tag; ctx.SFX.click(); buildPopular(); draw(); };
      popular.append(b);
    }
    if (filterTag) {
      const rm = el('button', 'chip t-small is-orange', 'REMOVE FILTER');
      rm.onclick = () => { filterTag = null; ctx.SFX.back(); buildPopular(); draw(); };
      popular.append(rm);
    }
  }

  /* ---- the clipping ---- */
  function clipping(group) {
    const { lead, others } = group;
    const c = el('article', 'clip corner-1');
    c.tabIndex = 0;

    const rag = el('div', 'ragged');
    rag.innerHTML = raggedEdge(lead.id, 124);
    c.append(rag);

    const mast = el('div', 'masthead t-small');
    mast.innerHTML = `<span>THE DAILY BYTE</span><span>${new Date(lead.firstSeen).toLocaleDateString('en-IN', { day:'numeric', month:'short' }).toUpperCase()}</span>`;
    c.append(mast);

    c.append(el('h3', 't-headnews', lead.title));

    if (lead.summary) {
      const s = el('p', 'summary t-body');
      const chip = el('span', 'aisum t-small', 'AI SUMMARY');
      chip.title = 'Written by a model from the source text. The original headline and link are always beside it.';
      s.append(chip, document.createTextNode(' ' + lead.summary + ' '));
      const orig = el('a', 't-small', 'SHOW ORIGINAL');
      orig.href = lead.url; orig.target = '_blank'; orig.rel = 'noopener noreferrer';
      s.append(orig);
      c.append(s);
    }

    const src = el('p', 'src t-small',
      `SOURCE: ${lead.source?.host || 'unknown'} · ${ago(lead.firstSeen)}`);
    c.append(src);

    if (others.length) {
      const tab = el('button', 'srctab t-small', `+${others.length} SOURCES`);
      tab.setAttribute('aria-expanded', 'false');
      const stack = el('div', 'srcstack t-small');
      stack.hidden = true;
      stack.append(el('p', 't-small', 'Every source listed. Nothing merged.'));
      for (const o of [lead, ...others]) {
        const r = el('p', 't-small');
        const a = el('a', '', o.source?.host || 'source');
        a.href = o.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
        r.append(a, document.createTextNode(` · ${ago(o.firstSeen)} · "${o.title}"`));
        stack.append(r);
      }
      tab.onclick = () => {
        stack.hidden = !stack.hidden;
        tab.setAttribute('aria-expanded', String(!stack.hidden));
        ctx.SFX.click();
      };
      c.append(tab, stack);
    }

    const acts = el('div', 'acts');
    const read = el('a', 'btn t-small', 'READ');
    read.href = lead.url; read.target = '_blank'; read.rel = 'noopener noreferrer'; read.style.textDecoration = 'none';
    read.onclick = () => { bump(lead.skills, 'read'); };
    const save = el('button', 'btn t-small', 'SAVE');
    save.onclick = async () => { await mark(lead, STATE.SAVED); await bump(lead.skills, 'save'); ctx.coins++; ctx.refreshChrome(); ctx.SFX.save(); save.textContent = 'SAVED'; };
    const more = el('button', 'btn t-small', 'MORE');
    more.onclick = async () => { await bump(lead.skills, 'more'); ctx.SFX.click(); ctx.toast('MORE LIKE THIS', 'is-ghost'); };
    const less = el('button', 'btn t-small', 'LESS');
    less.onclick = async () => { await bump(lead.skills, 'less'); ctx.SFX.del(); c.remove(); ctx.toast('LESS LIKE THIS', 'is-ghost'); };
    const report = el('button', 'btn t-small', 'REPORT');
    report.onclick = () => {
      if (c.querySelector('.rep')) return;
      const f = el('div', 'rep');
      f.style.cssText = 'display:grid;gap:calc(2*var(--u));margin-top:calc(3*var(--u))';
      const sel = el('select', 't-small');
      sel.style.cssText = 'background:#E3D6BC;color:var(--ink-desk);border:var(--u) solid #5A5248';
      for (const r of ['WRONG SUMMARY', 'DEAD LINK', 'DUPLICATE MISSED', 'NOT NEWS']) {
        const o = el('option', '', r); o.value = r; sel.append(o);
      }
      const note = el('input', 't-small'); note.placeholder = 'optional note';
      note.style.cssText = 'background:#E3D6BC;color:var(--ink-desk);border:var(--u) solid #5A5248;padding:calc(2*var(--u))';
      const send = el('button', 'btn t-small', 'SAVE NOTE');
      send.onclick = () => { ctx.toast('NOTED LOCALLY', 'is-ghost'); f.remove(); };
      f.append(sel, note, send);
      c.append(f);
    };
    acts.append(read, save, more, less, report);
    c.append(acts);

    if (lead._mock) {
      const w = el('p', 't-small', 'SEED ROW — fictional, not real reporting.');
      w.style.color = '#8A3F33';
      c.append(w);
    }
    return c;
  }

  function draw() {
    clips.innerHTML = '';
    const groups = clustered();
    if (!groups.length) {
      clips.append(el('p', 'stub t-body', filterTag
        ? 'Nothing under that tag. Remove the filter to see everything.'
        : 'No news in the data yet. Build step 6 adds the daily feed.'));
      return;
    }
    for (const g of groups) clips.append(clipping(g));
  }

  const stopHooks = [];
  const onKey = e => { if (e.detail.key === ' ' || e.detail.key === 'spacebar') { paused = !paused; ctx.SFX.click(); } };
  document.addEventListener('arcade:key', onKey);
  new MutationObserver((m, o) => {
    if (!wrap.isConnected) {
      document.removeEventListener('arcade:key', onKey);
      for (const fn of stopHooks) fn();     // clear the ticker interval when the page leaves
      o.disconnect();
    }
  }).observe(document.getElementById('page'), { childList: true });

  buildTicker(); buildPopular(); draw();
  return wrap;
}
