/* NOTES — the inventory. UI Spec v2 section 12.
 *
 * Quick capture is one action: type, paste a link, drop an image, or record a voice memo.
 * [[Title]] links one note to another. Related suggestions always say why, and never link
 * anything until you say so. Everything is in IndexedDB on this machine.
 */

import * as S from '../store.js';
import * as UNDO from '../undo.js';
import { ditherTo16 } from '../sprites.js';

export const title = 'NOTES';
export const keys = [['N', 'CAPTURE'], ['ESC', 'BACK']];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const THUMB = 64;
const isUrl = s => { try { const u = new URL(s.trim()); return /^https?:$/.test(u.protocol) ? u : null; } catch { return null; } };

export async function render(ctx) {
  const wrap = el('div');
  let notes = await S.all('notes');
  const byTitle = t => notes.find(n => n.title.toLowerCase() === String(t).trim().toLowerCase());
  const reload = async () => { notes = await S.all('notes'); };

  /* ---- image: dithered to the 16-colour palette, so a photo looks like it belongs here ---- */
  async function imageAttachment(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
      });
      const r = Math.min(THUMB / img.width, THUMB / img.height, 1);
      const c = ditherTo16(img, Math.max(1, Math.round(img.width * r)), Math.max(1, Math.round(img.height * r)));
      return { id: S.uid('att'), kind: 'image', name: file.name, data: c.toDataURL('image/png') };
    } finally { URL.revokeObjectURL(url); }
  }

  /* ================= quick capture ================= */
  function capture() {
    const box = el('div', 'capture');
    box.append(el('h2', 't-label', 'QUICK CAPTURE'));

    const ta = el('textarea', 'field'); ta.id = 'cap-text'; ta.rows = 2;
    ta.placeholder = 'type a thought, or paste a link. [[Another Note]] makes a link.';
    box.append(ta);

    const atts = [];
    const strip = el('div', 'atts');
    const drawAtts = () => {
      strip.innerHTML = '';
      for (const a of atts) {
        const chip = el('span', 'att');
        if (a.kind === 'image') { const i = new Image(); i.src = a.data; i.alt = a.name; chip.append(i); }
        else chip.append(el('span', 't-small', a.kind === 'audio' ? 'VOICE MEMO' : a.name));
        const x = el('button', 'btn is-ghost t-small', '×');
        x.title = 'Remove'; x.onclick = () => { atts.splice(atts.indexOf(a), 1); drawAtts(); };
        chip.append(x); strip.append(chip);
      }
    };
    box.append(strip);

    const row = el('div', 'caprow');

    const img = el('input'); img.type = 'file'; img.accept = 'image/*'; img.hidden = true; img.id = 'cap-img';
    img.onchange = async () => {
      for (const f of img.files || []) atts.push(await imageAttachment(f));
      img.value = ''; ctx.SFX.click(); drawAtts();
    };
    const imgBtn = el('button', 'btn t-small', 'IMAGE');
    imgBtn.onclick = () => img.click();

    /* Voice: the browser may refuse the microphone, and if it does we say so plainly. */
    let rec = null, chunks = [];
    const voice = el('button', 'btn t-small', 'VOICE');
    voice.onclick = async () => {
      if (rec) {
        rec.stop(); return;
      }
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        ctx.toast('THIS BROWSER WILL NOT RECORD AUDIO HERE', 'is-orange'); return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rec = new MediaRecorder(stream); chunks = [];
        rec.ondataavailable = e => chunks.push(e.data);
        rec.onstop = async () => {
          for (const t of stream.getTracks()) t.stop();
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          atts.push({ id: S.uid('att'), kind: 'audio', name: 'voice memo', data: blob });
          rec = null; voice.textContent = 'VOICE'; voice.classList.remove('is-rec');
          ctx.SFX.save(); drawAtts();
        };
        rec.start(); voice.textContent = 'STOP'; voice.classList.add('is-rec');
        ctx.toast('RECORDING — PRESS STOP', 'is-ghost');
      } catch {
        ctx.toast('MICROPHONE REFUSED — NOTHING WAS RECORDED', 'is-orange');
      }
    };

    const save = el('button', 'btn is-primary t-small', 'CAPTURE');
    save.onclick = async () => {
      const text = ta.value.trim();
      if (!text && !atts.length) { ta.focus(); return; }
      const link = isUrl(text);
      const note = S.blankNote({
        title: link ? link.hostname + link.pathname.slice(0, 24) : (text.split('\n')[0].slice(0, 48) || 'CAPTURE'),
        body_md: text,
        attachments: [...atts],
        tags: link ? ['link'] : []
      });
      // A bare link is a link note, so keep the URL where it can be opened.
      if (link) note.attachments.push({ id: S.uid('att'), kind: 'link', name: link.href, data: link.href });
      await S.put('notes', note);
      ta.value = ''; atts.length = 0; drawAtts();
      await reload(); ctx.SFX.save(); list();
    };

    row.append(imgBtn, voice, save, img);
    box.append(row);
    box.append(Object.assign(el('p', 't-small', 'STAYS ON THIS MACHINE. NOTHING IS UPLOADED.'),
      { style: 'color:var(--muted)' }));
    return box;
  }

  /* ================= inventory ================= */
  function list() {
    wrap.innerHTML = '';
    const h = el('div', 'hdr'); h.innerHTML = '<h1 class="t-display">NOTES</h1>';
    const add = el('button', 'btn t-small', '+ FULL NOTE');
    add.onclick = () => { ctx.SFX.click(); edit(null); };
    h.append(add);
    wrap.append(h, capture());

    const tags = [...new Set(notes.flatMap(n => n.tags || []))].sort();
    if (tags.length) {
      const tr = el('div', 'tagrow');
      tr.append(el('span', 't-small', 'TAGS'));
      for (const t of tags) {
        const b = el('button', 'chip t-small is-ghost', '#' + t);
        b.onclick = () => { ctx.SFX.click(); list(t); };
        tr.append(b);
      }
      wrap.append(tr);
    }

    const filterTag = arguments[0];
    let shown = [...notes];
    if (typeof filterTag === 'string') {
      shown = shown.filter(n => (n.tags || []).includes(filterTag));
      const clear = el('button', 'chip t-small is-orange', `CLEAR #${filterTag}`);
      clear.onclick = () => list();
      wrap.append(clear);
    }

    if (!shown.length) {
      wrap.append(el('p', 'empty t-body',
        notes.length ? 'No notes under that tag.'
          : 'Nothing captured yet. Type above and press CAPTURE. Write [[Another Note]] inside a note to link them.'));
      return;
    }

    const grid = el('div', 'inv');
    for (const n of shown.sort((a, b) => b.updated - a.updated)) {
      const c = el('button', 'note-cell');
      const shot = (n.attachments || []).find(a => a.kind === 'image');
      if (shot) { const i = new Image(); i.src = shot.data; i.alt = ''; i.className = 'thumb'; c.append(i); }
      c.append(el('span', 'nt t-label', n.title || 'UNTITLED'));
      c.append(el('span', 'ns t-small', (n.body_md || '').replace(/\s+/g, ' ').slice(0, 54)));
      const marks = [];
      if ((n.attachments || []).some(a => a.kind === 'audio')) marks.push('VOICE');
      if ((n.attachments || []).some(a => a.kind === 'link')) marks.push('LINK');
      if (n.synthesis) marks.push('CRAFT');
      if (marks.length) c.append(el('span', 'nm t-small', marks.join(' · ')));
      c.onmouseenter = () => ctx.SFX.hover();
      c.onclick = () => { ctx.SFX.click(); view(n.id); };
      grid.append(c);
    }
    wrap.append(grid);
  }

  /* ---- body with [[links]] as buttons. textContent only: a note is never parsed as HTML. ---- */
  function bodyNode(text) {
    const box = el('div', 'note-body t-body');
    let last = 0;
    for (const m of String(text || '').matchAll(S.LINK_RE)) {
      box.append(document.createTextNode(text.slice(last, m.index)));
      const target = byTitle(m[1]);
      const b = el('button', 'wikilink' + (target ? '' : ' is-dead'), m[1]);
      b.title = target ? 'Open note' : 'No note with this title yet. Click to start it.';
      b.onclick = () => { ctx.SFX.click(); target ? view(target.id) : edit(null, m[1]); };
      box.append(b);
      last = m.index + m[0].length;
    }
    box.append(document.createTextNode(text.slice(last)));
    return box;
  }

  /* ================= one note ================= */
  function view(id) {
    const n = notes.find(x => x.id === id); if (!n) return list();
    wrap.innerHTML = '';
    const h = el('div', 'hdr'); h.append(el('h1', 't-title', n.title || 'UNTITLED'));
    wrap.append(h);
    const v = el('div', 'note-view');

    if ((n.tags || []).length) {
      const tr = el('div', 'tagrow');
      for (const t of n.tags) tr.append(el('span', 'chip t-small is-ghost', '#' + t));
      v.append(tr);
    }

    v.append(bodyNode(n.body_md));

    for (const a of n.attachments || []) {
      if (a.kind === 'image') { const i = new Image(); i.src = a.data; i.alt = a.name; i.className = 'shot'; v.append(i); }
      else if (a.kind === 'audio') {
        const au = document.createElement('audio'); au.controls = true;
        au.src = a.data instanceof Blob ? URL.createObjectURL(a.data) : a.data;
        v.append(au);
      } else if (a.kind === 'link') {
        const link = el('a', 't-small', a.name); link.href = a.data;
        link.target = '_blank'; link.rel = 'noopener noreferrer';
        v.append(link);
      }
    }

    const back = S.backlinksTo(n, notes);
    if (back.length) {
      const bl = el('p', 'backlinks t-small', 'LINKED FROM: ');
      back.forEach((o, i) => {
        const b = el('button', 'wikilink', o.title); b.style.color = 'var(--cyan)';
        b.onclick = () => view(o.id);
        bl.append(b); if (i < back.length - 1) bl.append(document.createTextNode(', '));
      });
      v.append(bl);
    }

    /* related: a suggestion, a reason, and a button. Nothing is linked without the button. */
    const sugg = S.relatedNotes(n, notes);
    const rel = el('div', 'related');
    rel.append(el('h3', 't-label', 'RELATED'));
    const linked = (n.related_ids || []).map(id2 => notes.find(x => x.id === id2)).filter(Boolean);
    for (const o of linked) {
      const r = el('div', 'relrow');
      const b = el('button', 'wikilink', o.title); b.onclick = () => view(o.id);
      const un = el('button', 'btn is-ghost t-small', 'UNLINK');
      un.onclick = async () => {
        n.related_ids = n.related_ids.filter(x => x !== o.id); n.updated = Date.now();
        await S.put('notes', n); await reload(); ctx.SFX.del(); view(n.id);
      };
      r.append(el('span', 't-small', 'LINKED'), b, un);
      rel.append(r);
    }
    for (const s of sugg) {
      const r = el('div', 'relrow');
      const b = el('button', 'wikilink', s.note.title); b.onclick = () => view(s.note.id);
      const why = el('span', 'why t-small', s.reason);
      const ok = el('button', 'btn t-small', 'LINK THESE');
      ok.onclick = async () => {
        n.related_ids = [...(n.related_ids || []), s.note.id]; n.updated = Date.now();
        await S.put('notes', n); await reload(); ctx.SFX.pluck(); view(n.id);
      };
      r.append(b, why, ok);
      rel.append(r);
    }
    if (!linked.length && !sugg.length) rel.append(el('p', 't-small unstated', 'NOTHING RELATED YET.'));
    v.append(rel);

    if (n.synthesis) v.append(synthesisView(n));

    const row = el('div', 'form-row');
    const e = el('button', 'btn t-small', 'EDIT'); e.onclick = () => edit(n.id);
    const craft = el('button', 'btn t-small', n.synthesis ? 'EDIT CRAFT' : 'CRAFT');
    craft.title = 'Question, evidence, decision, outcome, next';
    craft.onclick = () => synthesis(n.id);
    const d = el('button', 'btn t-small', 'DELETE');
    d.onclick = async () => {
      if (d.dataset.armed !== '1') { d.dataset.armed = '1'; d.textContent = 'SURE? CLICK AGAIN'; return; }
      const back = await S.snapshotFor('notes', n.id);
      await S.del('notes', n.id); await reload(); ctx.SFX.del(); list();
      UNDO.record('deleted the note ' + (n.title || 'untitled'), async () => { await back(); await reload(); list(); });
      ctx.toast('NOTE DELETED', 'is-orange', { undo: true });
    };
    const b = el('button', 'btn is-ghost t-small', 'BACK'); b.onclick = () => { ctx.SFX.back(); list(); };
    row.append(e, craft, d, b);
    v.append(row);
    wrap.append(v);
  }

  /* ================= full editor ================= */
  function edit(id, presetTitle = '') {
    const n = id ? notes.find(x => x.id === id) : null;
    wrap.innerHTML = '';
    const h = el('div', 'hdr'); h.append(el('h1', 't-title', n ? 'EDIT NOTE' : 'NEW NOTE'));
    wrap.append(h);
    const f = el('div', 'note-view');

    const t = el('input', 'field'); t.placeholder = 'title'; t.value = n?.title || presetTitle; t.id = 'note-title';
    const tags = el('input', 'field'); tags.placeholder = 'tags, comma separated';
    tags.value = (n?.tags || []).join(', '); tags.id = 'note-tags';
    const b = el('textarea', 'field'); b.rows = 8; b.id = 'note-body';
    b.placeholder = 'write here. [[Other Note]] makes a link.'; b.value = n?.body_md || '';

    const row = el('div', 'form-row');
    const save = el('button', 'btn is-primary t-small', 'SAVE');
    save.onclick = async () => {
      const ttl = t.value.trim();
      if (!ttl) { t.focus(); ctx.toast('NEEDS A TITLE', 'is-orange'); return; }
      const clash = byTitle(ttl);
      if (clash && clash.id !== n?.id) { ctx.toast('TITLE ALREADY USED', 'is-orange'); return; }
      const rec = n || S.blankNote();
      rec.title = ttl;
      rec.body_md = b.value;
      rec.tags = tags.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      rec.updated = Date.now();
      await S.put('notes', rec); await reload(); ctx.SFX.save(); view(rec.id);
    };
    const cancel = el('button', 'btn is-ghost t-small', 'CANCEL');
    cancel.onclick = () => { ctx.SFX.back(); n ? view(n.id) : list(); };
    row.append(save, cancel);
    f.append(t, tags, b, row);
    wrap.append(f);
    t.focus();
  }

  /* ================= CRAFT: the synthesis page ================= */
  const CRAFT = [
    ['question', 'QUESTION', 'what were you actually trying to find out?'],
    ['evidence', 'EVIDENCE', 'what did you find, and where from?'],
    ['decision', 'DECISION', 'what did you decide to do?'],
    ['outcome', 'OUTCOME', 'what happened when you did it?'],
    ['next', 'NEXT LEARNING', 'what do you now want to know?']
  ];

  function synthesisView(n) {
    const s = n.synthesis || {};
    const box = el('div', 'craft');
    box.append(el('h3', 't-label', 'CRAFT'));
    for (const [k, label] of CRAFT) {
      const row = el('div', 'crow');
      row.append(el('span', 'ck t-small', label));
      row.append(el('span', 'cv t-body' + (s[k] ? '' : ' unstated'), s[k] || 'not filled in'));
      box.append(row);
    }
    const print = el('button', 'btn is-ghost t-small', 'COPY AS TEXT');
    print.onclick = async () => {
      const txt = `${n.title}\n\n` + CRAFT.map(([k, l]) => `${l}\n${s[k] || '-'}`).join('\n\n');
      try { await navigator.clipboard.writeText(txt); ctx.toast('COPIED', 'is-ghost'); }
      catch { ctx.toast('CLIPBOARD REFUSED', 'is-orange'); }
    };
    box.append(print);
    return box;
  }

  function synthesis(id) {
    const n = notes.find(x => x.id === id); if (!n) return list();
    wrap.innerHTML = '';
    const h = el('div', 'hdr'); h.append(el('h1', 't-title', 'CRAFT — ' + n.title));
    wrap.append(h);
    const f = el('div', 'note-view');
    f.append(Object.assign(el('p', 't-small',
      'Question, evidence, decision, outcome, next. Fill what you know and leave the rest blank.'),
    { style: 'color:var(--muted)' }));

    const fields = {};
    for (const [k, label, hint] of CRAFT) {
      const g = el('div', 'cfield');
      g.append(el('label', 't-label', label));
      const ta = el('textarea', 'field'); ta.rows = 2; ta.placeholder = hint;
      ta.id = 'craft-' + k; ta.value = n.synthesis?.[k] || '';
      fields[k] = ta; g.append(ta); f.append(g);
    }
    const row = el('div', 'form-row');
    const save = el('button', 'btn is-primary t-small', 'SAVE CRAFT');
    save.onclick = async () => {
      const s = {}; let any = false;
      for (const [k] of CRAFT) { s[k] = fields[k].value.trim(); if (s[k]) any = true; }
      n.synthesis = any ? s : null; n.updated = Date.now();
      await S.put('notes', n); await reload(); ctx.SFX.save(); view(n.id);
    };
    const cancel = el('button', 'btn is-ghost t-small', 'CANCEL');
    cancel.onclick = () => view(n.id);
    row.append(save, cancel);
    f.append(row);
    wrap.append(f);
  }

  const onKey = e => {
    if (e.detail.key === 'n') { const c = wrap.querySelector('#cap-text'); if (c) { c.focus(); e.detail.raw?.preventDefault(); } }
  };
  document.addEventListener('arcade:key', onKey);
  new MutationObserver((m, o) => {
    if (!wrap.isConnected) { document.removeEventListener('arcade:key', onKey); o.disconnect(); }
  }).observe(document.getElementById('page'), { childList: true });

  list();
  return wrap;
}
