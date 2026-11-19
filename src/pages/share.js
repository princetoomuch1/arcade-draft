/* THE SHARE BUILDER and THE SHARE VIEW.
 *
 * One module, two jobs, because they must never disagree about what a share contains: the preview
 * calls the same builder and the same renderer the recipient's link will.
 *
 * Nothing is ticked by default. Applications are not an option anywhere.
 */

import * as S from '../store.js';
import {
  buildPayload, encodePayload, decodePayload, shareToken,
  DEFAULT_CHOICES, DEFAULT_REDACTION, DEFAULT_STYLE, EXPIRY_CHOICES
} from '../share/payload.js';
import { shareNode, invalidNode, toMarkdown } from '../share/view.js';
import { qrCanvas } from '../share/qr.js';
import { sharePNG, download } from '../share/png.js';

export const title = 'SHARE';
export const keys = [['ESC', 'BACK']];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const day = t => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Read the `d=` payload out of the hash, which is where a share link carries it. */
export function payloadFromHash(hash = location.hash) {
  const q = String(hash).indexOf('?');
  if (q < 0) return null;
  return new URLSearchParams(String(hash).slice(q + 1)).get('d');
}

export async function render(ctx, params = {}) {
  const wrap = el('div');

  /* ---------- the share view, when a link carries a payload ---------- */
  const encoded = params.d || payloadFromHash();
  if (encoded) {
    const r = await decodePayload(encoded);
    wrap.append(r.ok ? shareNode(r.payload) : invalidNode(r.why));
    return wrap;
  }

  /* ---------- the builder ---------- */
  const [pins, goals, personal, notes, days] = await Promise.all([
    S.all('wallpins'), S.all('goals'), S.all('personal'), S.all('notes'), S.activeDays()
  ]);
  const source = { pins, goals, personal, notes, days };

  const choices = { ...DEFAULT_CHOICES, goalCheckpoints: false };
  const redaction = { ...DEFAULT_REDACTION, custom: [] };
  const style = { ...DEFAULT_STYLE };
  const header = {};
  let expiryDays = 7;

  const h = el('div', 'hdr'); h.innerHTML = '<h1 class="t-display">SHARE</h1>';
  wrap.append(h);
  wrap.append(Object.assign(el('p', 'creed t-small',
    'NOTHING IS TICKED TO BEGIN WITH. APPLICATIONS ARE NEVER SHAREABLE, AND EMAILS, PHONE NUMBERS '
    + 'AND ADDRESSES ARE MASKED WHEREVER THEY TURN UP.'), {}));

  const sb = el('div', 'sb');
  wrap.append(sb);

  const step = (n, name) => {
    const box = el('section', 'sb-step');
    box.append(el('h2', 't-label', `${n}. ${name}`));
    sb.append(box);
    return box;
  };

  const check = (box, label, key, hint) => {
    const row = el('div', 'sb-row');
    const id = 'ch-' + key;
    const input = el('input'); input.type = 'checkbox'; input.id = id;
    input.checked = !!choices[key];
    input.onchange = () => { choices[key] = input.checked; redraw(); };
    const lab = el('label', 't-body', label); lab.htmlFor = id;
    row.append(input, lab);
    if (hint) row.append(el('span', 'sb-note t-small', hint));
    box.append(row);
    return input;
  };

  /* --- 1. what to share --- */
  const s1 = step(1, 'WHAT TO SHARE');
  const countText = z => pins.filter(p => p.zone === z && p.type === 'text').length;
  check(s1, 'Wall — motivation', 'motivation', `${countText('MOTIVATION')} notes`);
  check(s1, 'Wall — goals', 'goals', `${goals.length} goals, progress only`);
  check(s1, 'Wall — goal checkpoints too', 'goalCheckpoints', 'off by default: these are working detail');
  check(s1, 'Wall — memories', 'memories', `${countText('MEMORIES')} notes`);
  check(s1, 'Wall — pinned from the desk', 'pinned',
    `${pins.filter(p => p.type === 'item_ref').length} pinned`);
  check(s1, 'Wall — random', 'random', `${countText('RANDOM')} notes`);
  check(s1, 'Trophies', 'trophies');
  check(s1, 'Journey numbers', 'journey', 'days shown up, things saved, goals finished');

  const noteRow = el('div', 'sb-row');
  noteRow.append(el('label', 't-body', 'One note'));
  const noteSel = el('select', 'field'); noteSel.id = 'share-note';
  noteSel.append(new Option('— none —', ''));
  for (const n of notes) noteSel.append(new Option(n.title || 'untitled', n.id));
  noteSel.onchange = () => { choices.note = noteSel.value || null; redraw(); };
  noteRow.append(noteSel);
  s1.append(noteRow);

  /* --- 2. redaction --- */
  const s2 = step(2, 'WHAT TO KEEP BACK');
  s2.append(Object.assign(el('p', 'sb-note t-small',
    'APPLICATIONS ARE ALWAYS HIDDEN. EMAILS, PHONE NUMBERS AND ADDRESSES ARE ALWAYS MASKED. '
    + 'THESE ARE THE CHOICES THAT ARE YOURS.'), {}));

  const urlRow = el('div', 'sb-row');
  urlRow.append(el('label', 't-body', 'Source links'));
  const urlSel = el('select', 'field'); urlSel.id = 'share-urls';
  for (const [v, t] of [['domain', 'domain only'], ['hide', 'hide completely']]) urlSel.append(new Option(t, v));
  urlSel.value = redaction.urls;
  urlSel.onchange = () => { redaction.urls = urlSel.value; redraw(); };
  urlRow.append(urlSel);
  s2.append(urlRow);

  const bodyRow = el('div', 'sb-row');
  const bodyId = 'share-body';
  const bodyIn = el('input'); bodyIn.type = 'checkbox'; bodyIn.id = bodyId;
  bodyIn.onchange = () => { redaction.noteBody = bodyIn.checked; redraw(); };
  const bodyLab = el('label', 't-body', 'Include the note body, not only its title');
  bodyLab.htmlFor = bodyId;
  bodyRow.append(bodyIn, bodyLab);
  s2.append(bodyRow);

  const customRow = el('div', 'sb-row');
  customRow.append(el('label', 't-body', 'Also mask these words'));
  const customIn = el('input', 'field'); customIn.id = 'share-custom';
  customIn.placeholder = 'comma separated';
  customIn.onchange = () => {
    redaction.custom = customIn.value.split(',').map(s => s.trim()).filter(Boolean);
    redraw();
  };
  customRow.append(customIn);
  s2.append(customRow);

  /* --- 3. style --- */
  const s3 = step(3, 'HOW IT LOOKS');
  const seg = (label, key, options) => {
    const row = el('div', 'sb-row');
    row.append(el('label', 't-body', label));
    const box = el('div', 'seg');
    for (const o of options) {
      const b = el('button', 't-small', o.toUpperCase());
      b.setAttribute('aria-pressed', String(style[key] === o));
      b.onclick = () => {
        style[key] = o;
        [...box.children].forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        redraw();
      };
      box.append(b);
    }
    row.append(box); s3.append(row);
  };
  seg('Wall material', 'material', ['cork', 'brick', 'panel', 'pegboard', 'plaster', 'chalk']);
  seg('Theme', 'theme', ['dark-room', 'light-room']);
  seg('Accent', 'accent', ['gold', 'cyan', 'pink']);

  const nameRow = el('div', 'sb-row');
  nameRow.append(el('label', 't-body', 'Your name (optional)'));
  const nameIn = el('input', 'field'); nameIn.id = 'share-name';
  nameIn.onchange = () => { header.name = nameIn.value.trim(); redraw(); };
  const tagIn = el('input', 'field'); tagIn.id = 'share-tagline';
  tagIn.placeholder = 'tagline (optional)';
  tagIn.onchange = () => { header.tagline = tagIn.value.trim(); redraw(); };
  nameRow.append(nameIn, tagIn);
  s3.append(nameRow);

  const expRow = el('div', 'sb-row');
  expRow.append(el('label', 't-body', 'Expires after'));
  const expSel = el('select', 'field'); expSel.id = 'share-expiry';
  for (const e of EXPIRY_CHOICES) expSel.append(new Option(e.label, String(e.days)));
  expSel.value = '7';
  expSel.onchange = () => { expiryDays = expSel.value === 'null' ? null : Number(expSel.value); redraw(); };
  expRow.append(expSel);
  s3.append(expRow);

  /* --- 4. preview --- */
  const s4 = step(4, 'PREVIEW, AND WHAT IT CARRIES');
  const preview = el('div', 'sb-preview');
  s4.append(preview);

  /* --- 5. the link --- */
  const s5 = step(5, 'THE LINK');
  const linkOut = el('textarea', 'field sb-link'); linkOut.readOnly = true; linkOut.id = 'share-link';
  const warn = el('p', 'sb-warn t-small');
  const qrBox = el('div');
  const btns = el('div', 'sb-row');
  s5.append(linkOut, warn, qrBox, btns);

  const makeLink = async () => {
    const payload = current();
    const enc = await encodePayload(payload);
    const base = location.href.split('#')[0];
    return { payload, url: `${base}#/share?d=${enc}` };
  };

  const gen = el('button', 'btn is-primary t-small', 'MAKE A LINK');
  gen.onclick = async () => {
    const { payload, url } = await makeLink();
    linkOut.value = url;
    warn.textContent = payload.expiresAt
      ? `ANYONE WITH THIS LINK CAN SEE IT UNTIL ${day(payload.expiresAt).toUpperCase()}. A LINK ALREADY SENT CANNOT BE TAKEN BACK — IT CAN ONLY RUN OUT.`
      : 'ANYONE WITH THIS LINK CAN SEE IT, WITH NO EXPIRY. A LINK ALREADY SENT CANNOT BE TAKEN BACK. USE A HOSTED SHARE IF YOU MAY WANT TO REVOKE IT.';
    qrBox.innerHTML = '';
    const qr = qrCanvas(url, 3);
    if (qr.ok) { const box = el('div', 'sb-qr'); box.append(qr.canvas); qrBox.append(box); }
    else qrBox.append(el('p', 'sb-note t-small', qr.why));
    await S.put('meta', { id: 'share-' + shareToken(), v: {
      kind: 'link', createdAt: payload.createdAt, expiresAt: payload.expiresAt,
      included: payload.redactionReport.included, url
    } });
    ctx.SFX.save();
  };

  const copy = el('button', 'btn t-small', 'COPY');
  copy.onclick = async () => {
    if (!linkOut.value) return;
    try { await navigator.clipboard.writeText(linkOut.value); ctx.toast('LINK COPIED', 'is-ghost'); }
    catch { linkOut.select(); ctx.toast('SELECT AND COPY — THE CLIPBOARD WAS REFUSED', 'is-orange'); }
  };

  const hosted = el('button', 'btn t-small', 'HOSTED FILE INSTEAD');
  hosted.title = 'A file you commit. Deleting it revokes the link for good.';
  hosted.onclick = async () => {
    const token = shareToken();
    const payload = current();
    const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
    const a = el('a'); a.href = URL.createObjectURL(blob);
    a.download = `share-${token}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    await S.put('meta', { id: 'share-' + token, v: {
      kind: 'file', token, createdAt: payload.createdAt, expiresAt: payload.expiresAt,
      included: payload.redactionReport.included,
      revokeBy: `delete public/shares/share-${token}.json and redeploy`
    } });
    ctx.toast('SAVED — DROP IT IN public/shares/ AND COMMIT', 'is-lime');
  };

  btns.append(gen, copy, hosted);

  /* --- 6. export --- */
  const s6 = step(6, 'EXPORT');
  const md = el('button', 'btn t-small', 'COPY AS MARKDOWN');
  md.onclick = async () => {
    const text = toMarkdown(current());
    try { await navigator.clipboard.writeText(text); ctx.toast('MARKDOWN COPIED', 'is-ghost'); }
    catch { ctx.toast('CLIPBOARD REFUSED', 'is-orange'); }
  };
  const pdf = el('button', 'btn t-small', 'PRINT OR SAVE AS PDF');
  pdf.onclick = () => window.print();
  /* The picture. Drawn by the browser out of the share's own DOM - no library, because a runtime
     dependency would cost the offline guarantee. It can fail honestly, so it says so when it does. */
  const png = el('button', 'btn t-small', 'SAVE AS A PICTURE');
  png.onclick = async () => {
    const card = preview.querySelector('.sv');
    if (!card) { ctx.toast('NOTHING TO DRAW YET', 'is-orange'); return; }
    const was = png.textContent;
    png.textContent = 'DRAWING…'; png.disabled = true;
    try {
      const r = await sharePNG(/** @type {HTMLElement} */ (card));
      if (!r.ok) { pngWhy.textContent = r.why.toUpperCase(); ctx.toast('NO PICTURE', 'is-orange'); return; }
      pngWhy.textContent = `SAVED ${r.width} x ${r.height}, AT TWICE THAT IN PIXELS.`;
      download(r.blob, 'my-wall.png');
      ctx.SFX.save();
    } finally { png.textContent = was; png.disabled = false; }
  };
  const pngWhy = el('p', 'sb-note t-small', '');
  const row6 = el('div', 'sb-row');
  row6.append(md, pdf, png);
  s6.append(row6, pngWhy);
  s6.append(Object.assign(el('p', 'sb-note t-small',
    'THE PICTURE IS DRAWN HERE, NOT UPLOADED ANYWHERE. PRINT GIVES A CLEAN PDF, AND THE LINK IS '
    + 'USUALLY WHAT YOU WANT.'), {}));

  const current = () => buildPayload(source, { choices, redaction, style, header, expiryDays });

  function redraw() {
    preview.innerHTML = '';
    preview.append(shareNode(current(), { preview: true }));
  }
  redraw();
  return wrap;
}
