/* Mochi.
 *
 * A pixel hamster who lives on the Desk, on a cushion, next to the succulent. She is the mascot
 * and the pet, and she is also where this project's engagement rules get tested in public: she
 * celebrates and she never guilts. Away a month and she is pleased to see you. There is no
 * hunger bar, no sad face, no "it has been 5 days".
 *
 * Drawn here rather than installed: every frame is a 16x16 grid of characters turned into <rect>s,
 * and every animation is a CSS keyframe with steps(). No Framer Motion, no sprite sheet, no
 * dependency — the project's zero-runtime-deps rule holds, and pixel art wants whole steps anyway.
 *
 * The pixel law applies: no rounded corners, no gradients, no blur, no rotate on live DOM. Where a
 * state would normally be a rotation — the CURIOUS head tilt — it is a different frame instead.
 */

import * as S from './store.js';

/* Worked out once per page load, from the value on disk BEFORE this visit overwrites it.
   Without this, mounting the Desk twice in one load — which the router does — ate the greeting:
   the first mount stamped lastSeen as now, and the second had nothing to greet. */
let sessionGreeting;

/* Warm desk palette. Deliberately not the Computer's cyan: she lives on the wooden desk, in the
   same ink as the paper and the succulent, and she would look like a UI element in arcade colours. */
const PALETTE = {
  o: '#3B2415',   // outline
  b: '#D8A05E',   // fur
  l: '#F2DCB8',   // belly
  e: '#E39A9A',   // inner ear
  y: '#2B1B10',   // eye
  n: '#A85A48',   // nose
  f: '#E8B98A',   // paws
  w: '#FFF6E0',   // sparkle
  s: '#8A6A3A',   // sunflower seed
  h: '#D1495B',   // heart
  c: '#A8554B',   // cushion
  d: '#8E4438',   // cushion shadow
  g: '#6FA287'    // scarf / accessory green
};

export const GRID = 16;

/* Each frame is 16 rows of 16 characters. '.' is transparent. */
export const FRAMES = {
  idle: [
    '..oo........oo..',
    '.obbo......obbo.',
    '.obeo......obeo.',
    '.obbboooooobbbo.',
    '.obbbbbbbbbbbbo.',
    'obbbbbbbbbbbbbbo',
    'obbwybbbbbbwybbo',
    'obbyybbnnbbyybbo',
    'obbbbbbnnbbbbbbo',
    '.obbbbbbbbbbbbo.',
    '.obblllllllllbo.',
    '.obllllllllllbo.',
    '..obllllllllbo..',
    '..obffbbbbffbo..',
    '...oooooooooo...',
    '................'
  ],
  /* blink: lids down. Used on a timer inside IDLE, not a state of its own. */
  blink: [
    '..oo........oo..',
    '.obbo......obbo.',
    '.obeo......obeo.',
    '.obbboooooobbbo.',
    '.obbbbbbbbbbbbo.',
    'obbbbbbbbbbbbbbo',
    'obbbbbbbbbbbbbbo',
    'obboobbnnbboobbo',
    'obbbbbbnnbbbbbbo',
    '.obbbbbbbbbbbbo.',
    '.obblllllllllbo.',
    '.obllllllllllbo.',
    '..obllllllllbo..',
    '..obffbbbbffbo..',
    '...oooooooooo...',
    '................'
  ],
  /* eating: cheeks out past the head, eyes half shut, a seed held in both paws. */
  eat: [
    '..oo........oo..',
    '.obbo......obbo.',
    '.obeo......obeo.',
    '.obbboooooobbbo.',
    '.obbbbbbbbbbbbo.',
    'obbbbbbbbbbbbbbo',
    'obbbbbbbbbbbbbbo',
    'obboobbnnbboobbo',
    'obbbbbbnnbbbbbbo',
    'obbbbbbbbbbbbbbo',
    'obbblllllllllbbo',
    '.obllllllllllbo.',
    '..obllllllllbo..',
    '..obfsbbbbsfbo..',
    '...oooooooooo...',
    '................'
  ],
  /* sleeping: curled low with the ears folded down. The Z's are separate DOM so they can float. */
  sleep: [
    '................',
    '................',
    '................',
    '....oo....oo....',
    '...obbo..obbo...',
    '...obbboobbbo...',
    '..obbbbbbbbbbo..',
    '.obbbbbbbbbbbbo.',
    'obboobbnnbboobbo',
    'obbbbbbbbbbbbbbo',
    'obbblllllllllbbo',
    'obllllllllllllbo',
    '.obllllllllllbo.',
    '..obffbbbbffbo..',
    '...oooooooooo...',
    '................'
  ],
  /* running, frame 1: front paws forward, back legs tucked. */
  run1: [
    '..oo........oo..',
    '.obbo......obbo.',
    '.obeo......obeo.',
    '.obbboooooobbbo.',
    '.obbbbbbbbbbbbo.',
    'obbbbbbbbbbbbbbo',
    'obbwybbbbbbwybbo',
    'obbyybbnnbbyybbo',
    'obbbbbbnnbbbbbbo',
    '.obbbbbbbbbbbbo.',
    '.obblllllllllbo.',
    '.obllllllllllbo.',
    '..obllllllllbo..',
    '.offbbbbbbbbffo.',
    '..oo........oo..',
    '................'
  ],
  /* running, frame 2: legs swapped under the body. */
  run2: [
    '..oo........oo..',
    '.obbo......obbo.',
    '.obeo......obeo.',
    '.obbboooooobbbo.',
    '.obbbbbbbbbbbbo.',
    'obbbbbbbbbbbbbbo',
    'obbwybbbbbbwybbo',
    'obbyybbnnbbyybbo',
    'obbbbbbnnbbbbbbo',
    '.obbbbbbbbbbbbo.',
    '.obblllllllllbo.',
    '.obllllllllllbo.',
    '..obllllllllbo..',
    '...obbffffbbo...',
    '....oooooooo....',
    '................'
  ],
  /* happy: sparkling eyes, open mouth, paws up. */
  happy: [
    '..oo........oo..',
    '.obbo......obbo.',
    '.obeo......obeo.',
    '.obbboooooobbbo.',
    '.obbbbbbbbbbbbo.',
    'obbbbbbbbbbbbbbo',
    'obbwwbbbbbbwwbbo',
    'obbwwbbnnbbwwbbo',
    'obbbbbonnobbbbbo',
    '.obbbboooobbbbo.',
    '.obblllllllllbo.',
    '.obllllllllllbo.',
    '.offllllllllffo.',
    '..oobbbbbbbboo..',
    '...oooooooooo...',
    '................'
  ],
  /* curious: the head leans left and one ear drops. Drawn, not rotated — the pixel law forbids
     rotate() on live DOM, and a rotated pixel grid goes blurry anyway. */
  curious: [
    '.oo.........oo..',
    'obbo.......obbo.',
    'obeo.......obbo.',
    'obbboooooobbbeo.',
    'obbbbbbbbbbbbbo.',
    'obbbbbbbbbbbbbo.',
    'obwybbbbbbwybbo.',
    'obyybbnnbbyybbbo',
    'obbbbbnnbbbbbbbo',
    '.obbbbbbbbbbbbo.',
    '.obblllllllllbo.',
    '.obllllllllllbo.',
    '..obllllllllbo..',
    '..obffbbbbffbo..',
    '...oooooooooo...',
    '................'
  ]
};

/** Every state the hamster can be in, and how long it lasts before falling back to idle. */
export const STATES = {
  idle:     { frames: ['idle'], ms: 0 },
  eating:   { frames: ['eat'], ms: 2500 },
  sleeping: { frames: ['sleep'], ms: 0 },      // until a click
  running:  { frames: ['run1', 'run2'], ms: 5000 },
  happy:    { frames: ['happy'], ms: 1600 },
  excited:  { frames: ['happy'], ms: 2000 },
  curious:  { frames: ['curious'], ms: 1400 }
};

const svgNS = 'http://www.w3.org/2000/svg';
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };

/** Turn one frame into <rect>s. One rect per pixel: 256 at most, and only on a state change. */
export function drawFrame(name) {
  const rows = FRAMES[name] || FRAMES.idle;
  const g = document.createElementNS(svgNS, 'g');
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const key = rows[y][x];
      const fill = PALETTE[key];
      if (!fill) continue;
      const r = document.createElementNS(svgNS, 'rect');
      r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
      r.setAttribute('width', '1'); r.setAttribute('height', '1');
      r.setAttribute('fill', fill);
      g.append(r);
    }
  }
  return g;
}

/** The cushion she sits on. Its colour is the level: a visible, free, unmissable reward. */
function drawCushion(level) {
  const g = document.createElementNS(svgNS, 'g');
  const tones = ['#A8554B', '#8A6A9A', '#4F7A6B', '#9A7A3A', '#7A4A5A'];
  const base = tones[(level - 1) % tones.length];
  const rect = (x, y, w, h, fill) => {
    const r = document.createElementNS(svgNS, 'rect');
    r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
    r.setAttribute('width', String(w)); r.setAttribute('height', String(h));
    r.setAttribute('fill', fill);
    g.append(r);
  };
  /* Wider than she is, so it shows at her sides rather than hiding under her outline. */
  rect(1, 13, 14, 2, base);
  rect(0, 14, 16, 1, base);
  rect(0, 15, 16, 1, PALETTE.d);
  return g;
}

/** Accessories, earned by level. Drawn over the body. */
function drawAccessories(list) {
  const g = document.createElementNS(svgNS, 'g');
  const px = (x, y, fill) => {
    const r = document.createElementNS(svgNS, 'rect');
    r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
    r.setAttribute('width', '1'); r.setAttribute('height', '1');
    r.setAttribute('fill', fill);
    g.append(r);
  };
  if (list.includes('scarf')) for (let x = 3; x <= 12; x++) px(x, 9, PALETTE.g);
  if (list.includes('tiny-hat')) { for (let x = 6; x <= 9; x++) px(x, 1, PALETTE.o); px(7, 0, PALETTE.o); px(8, 0, PALETTE.o); }
  if (list.includes('glasses')) { px(3, 7, PALETTE.w); px(5, 7, PALETTE.w); px(10, 7, PALETTE.w); px(12, 7, PALETTE.w); }
  if (list.includes('cup-of-tea')) { px(13, 12, PALETTE.w); px(14, 12, PALETTE.w); px(13, 13, PALETTE.n); px(14, 13, PALETTE.n); }
  if (list.includes('bow')) { px(4, 2, PALETTE.h); px(5, 2, PALETTE.h); px(4, 3, PALETTE.h); }
  if (list.includes('headphones')) { px(2, 4, PALETTE.o); px(13, 4, PALETTE.o); for (let x = 5; x <= 10; x++) px(x, 1, PALETTE.o); }
  if (list.includes('badge')) px(11, 11, PALETTE.w);
  if (list.includes('crown')) { px(6, 0, PALETTE.s); px(8, 0, PALETTE.s); px(10, 0, PALETTE.s); for (let x = 6; x <= 10; x++) px(x, 1, PALETTE.s); }
  return g;
}

/**
 * Mount the hamster. Returns a node for the Desk to place, and an API for the rest of the app
 * to tell her that something good happened.
 *
 * @param {{SFX: any, toast: Function}} ctx
 */
export async function mountHamster(ctx) {
  let h = S.drift(await S.hamster());
  if (sessionGreeting === undefined) sessionGreeting = S.greeting(h);
  const hello = sessionGreeting;
  h.lastSeen = new Date().toISOString();
  /* `hidden` is a this-session thing. It is written as false so that HIDE means "not now",
     which is what the menu promises, rather than "never again" — a pet you can lose for good by
     misclicking once is not a pet. */
  await S.saveHamster({ ...h, hidden: false });

  const wrap = el('div', 'ham');
  wrap.dataset.state = 'idle';
  if (h.hidden) wrap.hidden = true;

  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${GRID} ${GRID}`);
  svg.setAttribute('class', 'ham-art');
  svg.setAttribute('role', 'img');
  svg.setAttribute('shape-rendering', 'crispEdges');
  wrap.append(svg);

  const bubble = el('div', 'ham-say t-hand');
  bubble.hidden = true;
  wrap.append(bubble);

  const sparks = el('div', 'ham-sparks');
  sparks.setAttribute('aria-hidden', 'true');
  wrap.append(sparks);

  /* The button is the hamster: one target, keyboard reachable, with a name that says what a
     click does rather than what she is. */
  const hit = el('button', 'ham-hit');
  hit.setAttribute('aria-label', `Pet ${h.name}`);
  wrap.append(hit);

  let state = 'idle';
  let frameAt = 0;
  let timer = null, loop = null, blinkTimer = null;

  const label = () => {
    const moods = ['', '', 'content', 'content', 'happy', 'delighted'];
    svg.setAttribute('aria-label',
      `${h.name}, level ${h.level}, ${moods[h.mood] || 'content'}${state === 'sleeping' ? ', asleep' : ''}`);
    hit.setAttribute('aria-label', state === 'sleeping' ? `Wake ${h.name}` : `Pet ${h.name}`);
  };

  function paint(frameName) {
    svg.textContent = '';
    svg.append(drawCushion(h.level), drawFrame(frameName), drawAccessories(h.accessories || []));
    label();
  }

  function setState(next) {
    clearTimeout(timer); clearInterval(loop); clearTimeout(blinkTimer);
    state = next;
    wrap.dataset.state = next;
    const def = STATES[next] || STATES.idle;
    frameAt = 0;
    paint(def.frames[0]);

    /* Somebody who asked for less movement gets a still hamster, not a missing one. The CSS
       handles the keyframes; these two timers swap the drawing itself, so they have to check too. */
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.dataset.reduceMotion === 'true';

    if (def.frames.length > 1 && !still) {
      loop = setInterval(() => {
        frameAt = (frameAt + 1) % def.frames.length;
        paint(def.frames[frameAt]);
      }, 160);
    }
    if (next === 'idle' && !still) {
      const blink = () => {
        if (state !== 'idle') return;
        paint('blink');
        setTimeout(() => { if (state === 'idle') paint('idle'); }, 120);
        blinkTimer = setTimeout(blink, 3000 + Math.random() * 2000);
      };
      blinkTimer = setTimeout(blink, 3000 + Math.random() * 2000);
    }
    if (def.ms) timer = setTimeout(() => setState('idle'), def.ms);
  }

  function say(text, ms = 2600) {
    bubble.textContent = text;
    bubble.hidden = false;
    setTimeout(() => { bubble.hidden = true; }, ms);
  }

  /** Little hearts, for petting. DOM, removed when they are done. */
  function hearts(n = 3) {
    for (let i = 0; i < n; i++) {
      const s = el('i', 'ham-heart');
      s.style.left = `${20 + i * 24}%`;
      s.style.animationDelay = `${i * 90}ms`;
      sparks.append(s);
      setTimeout(() => s.remove(), 900);
    }
  }

  const save = async () => { await S.saveHamster({ ...h, hidden: false }); };

  async function pet() {
    if (state === 'sleeping') { setState('idle'); say(`${h.name} wakes up.`); return; }
    h = S.cheer(h);
    setState('happy');
    hearts();
    try { ctx.SFX.squeak?.(); } catch { /* sound is optional, the pet is not */ }
    await save();
  }

  async function feed() {
    h = S.cheer(h);
    h.lastFed = new Date().toISOString();
    setState('eating');
    try { ctx.SFX.squeak?.(); } catch { /* no sound, no problem */ }
    await save();
  }

  async function play() {
    h = S.cheer(h);
    h.lastPlayed = new Date().toISOString();
    setState('running');
    await save();
  }

  async function sleep() {
    h.lastSlept = new Date().toISOString();
    sleptAt = Date.now();
    setState('sleeping');
    await save();
  }

  /** Something real happened in the app. Celebrate it, and level up if it is a first. */
  async function milestone(id) {
    const r = S.hitMilestone(h, id);
    h = r.h;
    await save();
    if (!r.gained) return false;
    setState('excited');
    hearts(5);
    const m = S.MILESTONES.find(x => x.id === id);
    say(`Level ${h.level}! You ${m ? m.label : 'did a thing'}.`, 3600);
    return true;
  }

  /** New things landed on the desk. */
  function excite() { if (state !== 'sleeping') setState('excited'); }
  /** Something nearby is being hovered. */
  function curious() { if (state === 'idle') setState('curious'); }

  hit.onclick = e => { e.stopPropagation(); pet(); };

  /* The menu: right-click, or a long press, because a right-click is not discoverable and a
     long press is not available to a keyboard. Shift+Enter opens it too. */
  let menu = null;
  function closeMenu() { menu?.remove(); menu = null; }

  function openMenu() {
    closeMenu();
    menu = el('div', 'ham-menu');
    const add = (text, fn) => {
      const b = el('button', 'ham-mi t-small', text);
      b.onclick = async () => { closeMenu(); await fn(); };
      menu.append(b);
    };
    add('FEED', feed);
    add(state === 'sleeping' ? 'WAKE' : 'SLEEP', () => (state === 'sleeping' ? setState('idle') : sleep()));
    add('PLAY', play);
    add('RENAME', () => {
      closeMenu();
      const form = el('div', 'ham-menu');
      const i = el('input', 't-small');
      i.value = h.name; i.maxLength = 16;
      i.setAttribute('aria-label', 'What is the hamster called');
      const ok = el('button', 'ham-mi t-small', 'SAVE');
      const done = async () => {
        h.name = (i.value || '').trim().slice(0, 16) || S.HAMSTER_NAME;
        await save(); label(); say(`Hello, I am ${h.name}.`);
        form.remove();
      };
      ok.onclick = done;
      i.onkeydown = ev => { if (ev.key === 'Enter') done(); if (ev.key === 'Escape') form.remove(); };
      form.append(i, ok);
      wrap.append(form);
      i.focus(); i.select();
    });
    add('HIDE', async () => {
      wrap.hidden = true;
      h.hidden = true;        // in memory only: save() writes hidden:false, so she returns
      await save();
      ctx.toast(`${h.name.toUpperCase()} IS HIDDEN FOR NOW. SHE IS BACK NEXT TIME.`, 'is-ghost');
    });
    wrap.append(menu);
    menu.querySelector('button')?.focus();
  }

  hit.oncontextmenu = e => { e.preventDefault(); openMenu(); };
  hit.onkeydown = e => {
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); openMenu(); }
    if (e.key === 'Escape') closeMenu();
  };
  let press = null;
  hit.onpointerdown = () => { press = setTimeout(openMenu, 500); };
  const cancel = () => { clearTimeout(press); press = null; };
  hit.onpointerup = cancel;
  hit.onpointerleave = cancel;

  /* Any click anywhere wakes her, as promised — but not the click that just put her to sleep.
     That one is still bubbling up to the document while she settles. */
  let sleptAt = 0;
  const wake = () => {
    if (state === 'sleeping' && Date.now() - sleptAt > 300) setState('idle');
  };
  document.addEventListener('click', wake);

  /* After half an hour of nothing, she naps. That is rest, not a penalty: nothing is lost by it
     and a single click undoes it. */
  let idleNap = null;
  const resetNap = () => {
    clearTimeout(idleNap);
    idleNap = setTimeout(() => { if (state === 'idle') sleep(); }, 30 * 60 * 1000);
  };
  document.addEventListener('pointermove', resetNap, { passive: true });
  resetNap();

  /* Clean up when the Desk goes away, so timers do not pile up behind the router. */
  new MutationObserver((m, o) => {
    if (!wrap.isConnected) {
      clearTimeout(timer); clearInterval(loop); clearTimeout(blinkTimer); clearTimeout(idleNap);
      document.removeEventListener('click', wake);
      document.removeEventListener('pointermove', resetNap);
      o.disconnect();
    }
  }).observe(document.getElementById('page') || document.body, { childList: true, subtree: true });

  setState('idle');
  if (hello) setTimeout(() => say(hello, 3200), 600);

  return {
    node: wrap,
    api: { pet, feed, play, sleep, milestone, excite, curious, setState, openMenu,
      get state() { return state; }, get data() { return h; } }
  };
}
