/* NOTES — stage 5. Inventory grid of paper notes. [[Title]] links one note to another.
   Stored in IndexedDB 'notes' on this machine only. Image thumbnails are not built yet. */

import { put, all, del } from '../store.js';

export const title = 'NOTES';
export const keys = [['ESC','BACK']];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const LINK = /\[\[([^\]\n]+)\]\]/g;
const uid = () => 'n-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export async function render(ctx) {
  const wrap = el('div');
  let notes = await all('notes');
  const byTitle = t => notes.find(n => n.title.toLowerCase() === t.trim().toLowerCase());
  async function reload() { notes = await all('notes'); }

  function list() {
    wrap.innerHTML = '';
    const h = el('div', 'hdr'); h.innerHTML = '<h1 class="t-display">NOTES</h1>';
    const add = el('button', 'btn is-primary t-small', '+ NEW NOTE');
    add.onclick = () => { ctx.SFX.click(); edit(null); };
    h.append(add);
    wrap.append(h);

    if (!notes.length) {
      wrap.append(el('p', 'empty t-body', 'No notes yet. Make one. Write [[Another Note]] inside a note to link them.'));
      return;
    }
    const grid = el('div', 'inv');
    for (const n of [...notes].sort((a, b) => b.updated - a.updated)) {
      const c = el('button', 'note-cell');
      c.append(el('span', 'nt t-label', n.title || 'UNTITLED'),
               el('span', 'ns t-small', (n.body || '').replace(/\s+/g, ' ').slice(0, 60)));
      c.onmouseenter = () => ctx.SFX.hover();
      c.onclick = () => { ctx.SFX.click(); view(n.id); };
      grid.append(c);
    }
    wrap.append(grid);
  }

  /* body text with [[links]] as buttons. textContent only: note text is never parsed as HTML. */
  function bodyNode(text) {
    const box = el('div', 'note-body t-body');
    let last = 0;
    for (const m of text.matchAll(LINK)) {
      box.append(document.createTextNode(text.slice(last, m.index)));
      const target = byTitle(m[1]);
      const b = el('button', 'wikilink' + (target ? '' : ' is-dead'), m[1]);
      b.title = target ? 'Open note' : 'No note with this title yet. Click to create it.';
      b.onclick = () => { ctx.SFX.click(); target ? view(target.id) : edit(null, m[1]); };
      box.append(b);
      last = m.index + m[0].length;
    }
    box.append(document.createTextNode(text.slice(last)));
    return box;
  }

  function view(id) {
    const n = notes.find(x => x.id === id); if (!n) return list();
    wrap.innerHTML = '';
    const h = el('div', 'hdr'); h.append(el('h1', 't-title', n.title || 'UNTITLED'));
    wrap.append(h);
    const v = el('div', 'note-view');
    v.append(bodyNode(n.body || ''));

    const back = notes.filter(o => o.id !== n.id &&
      [...(o.body || '').matchAll(LINK)].some(m => m[1].trim().toLowerCase() === n.title.toLowerCase()));
    if (back.length) {
      const bl = el('p', 'backlinks t-small', 'LINKED FROM: ');
      back.forEach((o, i) => {
        const b = el('button', 'wikilink', o.title); b.style.color = 'var(--cyan)';
        b.onclick = () => view(o.id);
        bl.append(b); if (i < back.length - 1) bl.append(document.createTextNode(', '));
      });
      v.append(bl);
    }

    const row = el('div', 'form-row');
    const e = el('button', 'btn t-small', 'EDIT'); e.onclick = () => edit(n.id);
    const d = el('button', 'btn t-small', 'DELETE');
    d.onclick = async () => {
      if (d.dataset.armed !== '1') { d.dataset.armed = '1'; d.textContent = 'SURE? CLICK AGAIN'; return; }
      await del('notes', n.id); await reload(); ctx.SFX.del(); list();
    };
    const b = el('button', 'btn is-ghost t-small', 'BACK'); b.onclick = () => { ctx.SFX.back(); list(); };
    row.append(e, d, b);
    v.append(row);
    wrap.append(v);
  }

  function edit(id, presetTitle = '') {
    const n = id ? notes.find(x => x.id === id) : null;
    wrap.innerHTML = '';
    const h = el('div', 'hdr'); h.append(el('h1', 't-title', n ? 'EDIT NOTE' : 'NEW NOTE'));
    wrap.append(h);
    const f = el('div', 'note-view');
    const t = el('input', 'field'); t.placeholder = 'title'; t.value = n?.title || presetTitle; t.style.width = '100%';
    const gap = el('div'); gap.style.height = 'calc(3*var(--u))';
    const b = el('textarea', 'field'); b.placeholder = 'write here. [[Other Note]] makes a link.'; b.value = n?.body || '';
    const row = el('div', 'form-row'); row.style.marginTop = 'calc(4*var(--u))';
    const save = el('button', 'btn is-primary t-small', 'SAVE');
    save.onclick = async () => {
      const ttl = t.value.trim();
      if (!ttl) { t.focus(); ctx.toast('NEEDS A TITLE', 'is-orange'); return; }
      const clash = byTitle(ttl);
      if (clash && clash.id !== n?.id) { ctx.toast('TITLE ALREADY USED', 'is-orange'); return; }
      const rec = { id: n?.id || uid(), title: ttl, body: b.value, updated: Date.now() };
      await put('notes', rec); await reload(); ctx.SFX.save(); view(rec.id);
    };
    const cancel = el('button', 'btn is-ghost t-small', 'CANCEL');
    cancel.onclick = () => { ctx.SFX.back(); n ? view(n.id) : list(); };
    row.append(save, cancel);
    f.append(t, gap, b, row);
    wrap.append(f);
    t.focus();
  }

  list();
  return wrap;
}
