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
        seg(Object.keys(DENSITY), ctx.settings.density, async v => {
          await set('density', v);
          apply(v, document.documentElement, ctx.frameNow());
          ctx.refreshChrome();
        }));
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
        if (!ws.length) host.append(el('p', 't-small', 'No interests yet. Save or add things and it fills in.'));

        const row = w => {
          const r = el('div', 'interest' + (w.kind === 'explicit' ? ' is-chose' : '') + (w.paused ? ' is-muted' : ''));
          const bar = el('div', 'w'); const i = el('i'); i.style.width = `${Math.round(w.weight * 100)}%`; bar.append(i);
          bar.title = `${Math.round(w.weight * 100)} out of 100`;
          r.append(el('span', 't-body', w.label || w.id), bar);

          // REDUCE halves it. Turning something down is not the same as silencing it.
          const less = el('button', 'btn is-ghost t-small', 'REDUCE');
          less.title = 'Halve this interest. It keeps counting, just less.';
          less.onclick = async () => {
            const cur = await S.get('weights', w.id);
            cur.weight = Math.round(cur.weight * 50) / 100;
            cur.recency = Date.now();
            await S.put('weights', cur);
            ctx.weights = await S.weightMap(); ctx.SFX.notch(); draw();
          };
          const m = el('button', 'btn is-ghost t-small', w.paused ? 'RESUME' : 'PAUSE');
          m.title = w.paused ? 'Let this count again.' : 'Stop this counting, without forgetting it.';
          m.onclick = async () => {
            w.paused ? await S.resumeTopic(w.id) : await S.muteTopic(w.id);
            ctx.weights = await S.weightMap(); ctx.SFX.click(); draw();
          };
          const x = el('button', 'btn is-ghost t-small', 'REMOVE');
          x.title = 'Delete it. It can return if your behaviour suggests it again.';
          x.onclick = async () => { await S.del('weights', w.id); ctx.weights = await S.weightMap(); ctx.SFX.del(); draw(); };
          r.append(less, m, x);
          return r;
        };

        // The two kinds are kept apart on screen because only one of them decays or resets.
        for (const [label, list, resettable] of [
          ['YOU CHOSE THESE', ws.filter(w => w.kind === 'explicit'), false],
          ['WORKED OUT FROM WHAT YOU DID', ws.filter(w => w.kind !== 'explicit'), true]
        ]) {
          if (!list.length) continue;
          host.append(el('h3', 'igroup t-label', label));
          if (resettable) {
            const note = el('p', 't-small', 'These decay on their own: 3% a day. What you typed never does.');
            note.style.color = 'var(--muted)';
            const reset = el('button', 'btn is-ghost t-small', 'RESET ALL GUESSES');
            reset.title = 'Delete every inferred interest. What you typed yourself is untouched.';
            reset.onclick = async () => {
              if (reset.dataset.armed !== '1') { reset.dataset.armed = '1'; reset.textContent = 'SURE? CLICK AGAIN'; return; }
              for (const w of list) await S.del('weights', w.id);
              ctx.weights = await S.weightMap(); ctx.SFX.del(); draw();
            };
            host.append(note, reset);
          }
          for (const w of list.slice(0, 40)) host.append(row(w));
        }

        // Sources and places you muted from a card. The toast promised they are reversible here.
        for (const [kind, key, label] of [['source', 'mutedSources', 'MUTED SOURCES'], ['place', 'mutedPlaces', 'MUTED PLACES']]) {
          const list = ctx.settings[key] || [];
          if (!list.length) continue;
          host.append(el('p', 't-small', label));
          for (const v of list) {
            const r = el('div', 'interest is-muted');
            r.append(el('span', 't-body', v));
            const un = el('button', 'btn is-ghost t-small', 'UNMUTE');
            un.onclick = async () => { ctx.settings[key] = await S.unmuteList(kind, v); ctx.SFX.click(); draw(); };
            r.append(un); host.append(r);
          }
        }
      };
      draw();
      return [host];
    }],
    ['REFRESH', () => {
      const out = [];
      out.push(Object.assign(el('p', 't-small',
        'SCRAPING RUNS IN GITHUB ACTIONS, NEVER IN THIS BROWSER. WITH A REPOSITORY AND A TOKEN THIS '
        + 'BUTTON ASKS THE WORKFLOW TO RUN. WITHOUT THEM IT TELLS YOU THE COMMAND TO RUN YOURSELF.'),
      { style: 'color:var(--muted)' }));

      const repo = el('input', 'field'); repo.id = 'gh-repo'; repo.placeholder = 'owner/repo';
      repo.value = ctx.settings.githubRepo || '';
      repo.onchange = () => set('githubRepo', repo.value.trim());
      const repoRow = el('div', 'opt-row');
      repoRow.append(el('label', 't-label', 'REPOSITORY'), repo);
      out.push(repoRow);

      const tok = el('input', 'field'); tok.id = 'gh-token'; tok.type = 'password';
      tok.placeholder = 'token with actions:write';
      tok.value = ctx.settings.githubToken || '';
      tok.onchange = () => set('githubToken', tok.value.trim());
      const tokRow = el('div', 'opt-row');
      tokRow.append(el('label', 't-label', 'TOKEN'), tok);
      out.push(tokRow);
      out.push(Object.assign(el('p', 't-small',
        'The token is stored in this browser, unencrypted, like everything else here. Give it the '
        + 'narrowest scope that works (actions:write on that one repository) and revoke it if this '
        + 'machine is shared.'), { style: 'color:var(--orange)' }));

      const state = el('p', 'refresh-state t-small');
      const cmd = el('code', 'cmdline t-small');
      const showPlan = () => {
        const plan = S.refreshPlan(ctx.settings);
        state.textContent = plan.mode === 'dispatch'
          ? `READY: WILL ASK GITHUB TO RUN ${S.WORKFLOW} ON ${plan.repo}.`
          : 'NO REPOSITORY AND TOKEN SET. RUN THIS YOURSELF:';
        cmd.textContent = plan.command;
      };
      showPlan();

      const go = el('button', 'btn is-primary t-small', 'REFRESH ALL');
      go.onclick = async () => {
        showPlan();
        const plan = S.refreshPlan(ctx.settings);
        if (plan.mode === 'manual') {
          ctx.SFX.back();
          ctx.toast('NO TOKEN — RUN THE COMMAND SHOWN', 'is-orange');
          return;
        }
        go.disabled = true; go.textContent = 'ASKING GITHUB…';
        const res = await S.requestRefresh(ctx.settings);
        go.disabled = false; go.textContent = 'REFRESH ALL';
        state.textContent = res.message.toUpperCase();
        state.style.color = res.ok ? 'var(--lime)' : 'var(--orange)';
        res.ok ? ctx.SFX.levelUp() : ctx.SFX.back();
      };
      out.push(go, state, cmd);
      return out;
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
