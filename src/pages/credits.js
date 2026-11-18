/* CREDITS — every borrowed thing, with its licence. If something is not on this page, it is not
   in the app. Nothing here is paid, and nothing here is unlicensed. */

export const title = 'CREDITS';
export const keys = [];

const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };

const FONTS = [
  ['Press Start 2P', 'CodeMan38', 'SIL Open Font License 1.1', 'https://fonts.google.com/specimen/Press+Start+2P'],
  ['Silkscreen', 'Jason Kottke', 'SIL Open Font License 1.1', 'https://fonts.google.com/specimen/Silkscreen'],
  ['VT323', 'Peter Hull', 'SIL Open Font License 1.1', 'https://fonts.google.com/specimen/VT323'],
  ['Pixelify Sans', 'Stefie Justprince', 'SIL Open Font License 1.1', 'https://fonts.google.com/specimen/Pixelify+Sans']
];

const OURS = [
  ['Icons', 'Drawn in this repo as inline SVG paths on a 14×14 grid. No icon set is used.'],
  ['App icons', 'Generated from a 16×16 grid by a small PNG encoder written for this project.'],
  ['Company marks', 'Procedural, from a hash of the name (src/sprites.js). No logo is reproduced.'],
  ['Sound', 'Synthesized at runtime with the Web Audio API (src/sound.js). No audio files, so no licence applies.'],
  ['Textures', 'Crisp SVG tiles written by hand in the stylesheets. No bitmaps, no stock art.']
];

const TOOLS = [
  ['Vitest', 'MIT'], ['ESLint', 'MIT'], ['TypeScript', 'Apache-2.0'],
  ['Playwright', 'Apache-2.0'], ['axe-core', 'MPL-2.0'], ['fake-indexeddb', 'Apache-2.0'], ['jsdom', 'MIT']
];

export function render() {
  const wrap = el('div');
  const h = el('div', 'hdr'); h.innerHTML = '<h1 class="t-display">CREDITS</h1>';
  wrap.append(h);
  wrap.append(Object.assign(el('p', 'creed t-small',
    'EVERYTHING BORROWED IS LISTED HERE WITH ITS LICENCE. NOTHING IN THIS APP IS PAID FOR, AND '
    + 'NOTHING IS USED WITHOUT ONE.'), {}));

  const section = (name, rows) => {
    wrap.append(el('h2', 't-title', name));
    const box = el('div', 'credit-list');
    for (const r of rows) box.append(r);
    wrap.append(box);
  };

  section('FONTS', FONTS.map(([name, who, lic, url]) => {
    const row = el('div', 'credit');
    const a = el('a', 'cn t-label', name);
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    row.append(a, el('span', 'cw t-small', who), el('span', 'cl t-small', lic));
    return row;
  }));

  section('MADE HERE', OURS.map(([name, what]) => {
    const row = el('div', 'credit');
    row.append(el('span', 'cn t-label', name), el('span', 'cw t-small', what));
    return row;
  }));

  section('BUILD TOOLS', TOOLS.map(([name, lic]) => {
    const row = el('div', 'credit');
    row.append(el('span', 'cn t-label', name), el('span', 'cl t-small', lic));
    return row;
  }));

  wrap.append(el('h2', 't-title', 'DATA'));
  wrap.append(el('p', 't-body',
    'The rows in data/ are fictional seed rows while no source is configured: every one carries '
    + '_mock: true and a source of seed.local. When you add a real source in scrapers/sources.json, '
    + 'its name and host appear on every card it produced, and on this page below.'));

  wrap.append(el('h2', 't-title', 'YOUR DATA'));
  wrap.append(el('p', 't-body',
    'Notes, applications, goals, the wall and your interests live in IndexedDB on this machine. '
    + 'They are never uploaded. There is no analytics, no tracking and no third-party request '
    + 'beyond the font files above.'));
  return wrap;
}
