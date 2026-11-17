/* MAIN MENU — what the Computer shows when you sit down at it. UI Spec v2 section 7.4.
   Eight pages, one job each, reachable by number. This is the Computer's front screen; the room's
   home is the Desk, and the monitor on it opens here. */

import { all } from '../store.js';

export const title = 'Main Menu';
export const keys = [['1-8', 'PAGE'], ['ESC', 'DESK']];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };

/* 14x14 pixel marks, drawn not borrowed. No emoji anywhere: they render as somebody else's artwork. */
const PAGES = [
  ['feed', 'FEED', 'Today’s drop, ranked for you', 'M1 2h12v3H1z M1 6h12v3H1z M1 10h12v2H1z'],
  ['jobs', 'JOBS', 'Mainstream, startup, normal, remote', 'M2 4h10v8H2z M5 4V2h4v2 M2 7h10'],
  ['hacks', 'HACKS', 'City, country and world', 'M7 1l2 5h5l-4 3 1 5-4-3-4 3 1-5-4-3h5z'],
  ['news', 'NEWS', 'Headlines with the source attached', 'M1 2h12v10H1z M3 4h5v3H3z M9 4h3M9 6h3M3 9h9'],
  ['notes', 'NOTES', 'What you are working on', 'M3 1h8v12l-4-2-4 2z M5 4h4M5 6h4'],
  ['cal', 'CALENDAR', 'Deadlines, and your own plan', 'M1 3h12v10H1z M1 6h12 M4 1v3M10 1v3 M4 9h2v2H4z'],
  ['apps', 'APPS', 'What you applied to, and what happened', 'M2 2h10v10H2z M4 5h6M4 7h6M4 9h4'],
  ['opts', 'SETTINGS', 'Pixels, sound, motion, privacy, data', 'M6 1h2v2h-2z M6 11h2v2h-2z M1 6h2v2H1z M11 6h2v2h-2z M5 5h4v4H5z']
];

export async function render(ctx) {
  const wrap = el('div', 'menu');

  const h = el('div', 'hdr');
  h.innerHTML = '<h1 class="t-display halo-cyan" style="color:var(--cyan)">MAIN MENU</h1>';
  wrap.append(h);

  /* One honest line of state. Counts are read, never guessed. */
  const personal = await all('personal');
  const saved = personal.filter(p => ['SAVED', 'PLANNED', 'PINNED'].includes(p.state)).length;
  const due = personal.filter(p => {
    const d = p.snapshot?.deadline ? (new Date(p.snapshot.deadline).getTime() - Date.now()) / 864e5 : null;
    return d != null && d >= 0 && d <= 7;
  }).length;
  const line = el('p', 'menu-state t-small');
  line.append(el('span', '', `${ctx.items.length} ITEMS LOADED`), el('span', '', `${saved} ON THE DESK`));
  if (due) line.append(el('span', 'due', `${due} DUE WITHIN 7 DAYS`));
  wrap.append(line);

  const grid = el('div', 'menu-grid');
  PAGES.forEach(([route, label, desc, path], i) => {
    const b = el('button', 'menu-cell bevel corner-1');
    b.innerHTML = `<span class="t-title num">${i + 1}</span>
      <svg class="mk" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor"
           stroke-width="1" shape-rendering="crispEdges"><path d="${path}"/></svg>
      <span class="lab t-label">${label}</span>
      <span class="dsc t-small">${desc}</span>`;
    b.onmouseenter = () => ctx.SFX.hover();
    b.onclick = () => { ctx.SFX.click(); ctx.go(route); };
    grid.append(b);
  });
  wrap.append(grid);

  const foot = el('p', 'menu-foot t-small');
  foot.textContent = 'PRESS A NUMBER, OR THE LETTER IN THE BAR BELOW. ESC GOES BACK TO THE DESK.';
  wrap.append(foot);

  const onKey = e => {
    const n = Number(e.detail.key);
    if (n >= 1 && n <= PAGES.length) { ctx.SFX.click(); ctx.go(PAGES[n - 1][0]); }
  };
  document.addEventListener('arcade:key', onKey);
  new MutationObserver((m, o) => {
    if (!wrap.isConnected) { document.removeEventListener('arcade:key', onKey); o.disconnect(); }
  }).observe(document.getElementById('page'), { childList: true });

  return wrap;
}
