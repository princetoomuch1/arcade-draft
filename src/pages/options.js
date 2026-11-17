/* OPTIONS — stage 5. Accordion: VIDEO, SOUND, MOTION, WALL AND DESK, INTEREST PROFILE, DATA.
   Every setting writes through store.setSetting and takes effect at once where it can. */

import * as S from '../store.js';
import { apply, DENSITY } from '../u.js';
import { setVolume, setMuted, setHoverBlips } from '../sound.js';

export const title = 'OPTIONS';
export const keys = [];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };

export async function render(ctx) {
  const wrap = el('div');
  const h = el('div', 'hdr'); h.innerHTML = '<h1 class="t-display">OPTIONS</h1>';
  wrap.append(h);

  const set = async (k, v) => { ctx.settings[k] = v; await S.setSetting(k, v); };

  const seg = (opts, value, onPick) => {
    const box = el('div', 'seg');
    for (const o of opts) {
      const b = el('button', 't-small', o);
      b.setAttribute('aria-pressed', String(o === value));
      b.onclick = () => { [...box.children].forEach(x => x.setAttribute('aria-pressed', String(x === b))); ctx.SFX.click(); onPick(o); };
      box.append(b);
    }
    return box;
  };
  const toggle = (label, key, after) => {
    const row = el('div', 'opt-row');
    row.append(el('label', 't-label', label));
    const b = el('button', 'btn t-small', ctx.settings[key] ? 'ON' : 'OFF');
    b.onclick = async () => { await set(key, !ctx.settings[key]); b.textContent = ctx.settings[key] ? 'ON' : 'OFF'; ctx.SFX.click(); after?.(); };
    row.append(b); return row;
  };
  const slider = (label, key, min, max, step, after) => {
    const row = el('div', 'opt-row');
    row.append(el('label', 't-label', label));
    const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = ctx.settings[key];
    r.oninput = () => { after?.(Number(r.value)); };
    r.onchange = () => set(key, Number(r.value));
    row.append(r); return row;
  };

  /** @type {[string, () => (Node|HTMLElement)[]][]} */
  const sections = [
    ['VIDEO', () => {
      const b = el('div');
      b.append(el('p', 't-small', 'PIXEL SIZE. CHUNKY is default. Use FINE on a 1440p or larger monitor.'),
        seg(Object.keys(DENSITY), ctx.settings.density, async v => { await set('density', v); apply(v); ctx.refreshChrome(); }));
      return [b, toggle('CRT SCANLINES', 'crt', () => ctx.refreshChrome())];
    }],
    ['SOUND', () => [
      slider('VOLUME', 'volume', 0, 1, 0.05, v => setVolume(v)),
      toggle('MUTE', 'muted', () => setMuted(ctx.settings.muted)),
      toggle('HOVER BLIPS', 'hoverBlips', () => setHoverBlips(ctx.settings.hoverBlips))
    ]],
    ['MOTION', () => [toggle('REDUCE MOTION', 'reduceMotion'),
      el('p', 't-small', 'Also follows your system setting. Applies to the next page change.')]],
    ['WALL AND DESK', () => {
      const b = el('div');
      b.append(el('p', 't-small', 'WALL MATERIAL (used when the Wall is built)'),
        seg(['cork', 'brick', 'panel'], ctx.settings.wallMaterial, v => set('wallMaterial', v)));
      return [b, toggle('DESK AS LIST', 'deskAsList')];
    }],
    ['INTEREST PROFILE', () => {
      const host = el('div');
      const draw = async () => {
        host.innerHTML = '';
        const ws = (await S.all('weights')).sort((a, b) => b.weight - a.weight);
        const addRow = el('div', 'form-row');
        const inp = el('input', 'field'); inp.placeholder = 'add an interest';
        const add = el('button', 'btn is-primary t-small', 'ADD');
        add.onclick = async () => { if (!inp.value.trim()) return; await S.chooseInterest(inp.value); ctx.weights = await S.weightMap(); ctx.SFX.save(); draw(); };
        inp.onkeydown = e => { if (e.key === 'Enter') add.click(); };
        addRow.append(inp, add); host.append(addRow);
        if (!ws.length) { host.append(el('p', 't-small', 'Empty. Save or add things and it fills in.')); return; }
        for (const w of ws.slice(0, 40)) {
          const r = el('div', 'interest' + (w.kind === 'explicit' ? ' is-chose' : '') + (w.paused ? ' is-muted' : ''));
          const bar = el('div', 'w'); const i = el('i'); i.style.width = `${Math.round(w.weight * 100)}%`; bar.append(i);
          r.append(el('span', 't-body', w.label || w.id), bar, el('span', 't-small', w.kind.toUpperCase()));
          const m = el('button', 'btn is-ghost t-small', w.paused ? 'RESUME' : 'PAUSE');
          m.onclick = async () => {
            w.paused ? await S.resumeTopic(w.id) : await S.muteTopic(w.id);
            ctx.weights = await S.weightMap(); ctx.SFX.click(); draw();
          };
          r.append(m);
          const x = el('button', 'btn is-ghost t-small', 'FORGET');
          x.onclick = async () => { await S.del('weights', w.id); ctx.weights = await S.weightMap(); ctx.SFX.del(); draw(); };
          r.append(x); host.append(r);
        }
      };
      draw();
      return [host];
    }],
    ['DATA', () => {
      const note = el('p', 't-small', 'Everything lives in this browser on this machine. Nothing is sent anywhere.');
      const exp = el('button', 'btn t-small', 'EXPORT BACKUP (JSON)');
      exp.onclick = async () => {
        const out = {};
        for (const s of ['personal', 'notes', 'goals', 'apps', 'weights', 'meta']) out[s] = await S.all(s);
        const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }));
        const a = el('a'); a.href = url; a.download = `arcade-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      const wipe = el('button', 'btn t-small', 'ERASE ALL MY DATA');
      wipe.style.color = 'var(--danger)';
      wipe.onclick = async () => {
        if (wipe.dataset.armed !== '1') { wipe.dataset.armed = '1'; wipe.textContent = 'THIS CANNOT BE UNDONE. CLICK AGAIN'; return; }
        for (const s of ['personal', 'notes', 'goals', 'apps', 'weights', 'meta']) for (const r of await S.all(s)) await S.del(s, r.id);
        ctx.SFX.del(); location.reload();
      };
      return [note, exp, wipe];
    }]
  ];

  for (const [name, build] of sections) {
    const acc = el('div', 'acc');
    const head = el('button', 'acc-head t-label', name); head.setAttribute('aria-expanded', 'false');
    const body = el('div', 'acc-body'); body.hidden = true;
    let built = false;
    head.onclick = () => {
      const open = body.hidden;
      if (open && !built) { body.append(...build()); built = true; }
      body.hidden = !open; head.setAttribute('aria-expanded', String(open)); ctx.SFX.click();
    };
    acc.append(head, body); wrap.append(acc);
  }
  return wrap;
}
