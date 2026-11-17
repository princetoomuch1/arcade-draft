/* Service worker.
 *
 * Not covered by `tsc --noEmit`: this file runs in the ServiceWorkerGlobalScope, whose lib conflicts
 * with the DOM lib the rest of the project needs, and one program cannot hold both. ESLint does
 * check it, with the service-worker globals. Treat changes here as needing a browser check.
 *
 * Two jobs: make the app open without a network, and never show stale data
 * while pretending it is current.
 *
 * The shell (HTML, CSS, JS, fonts) is cache-first, because it only changes when a new version
 * deploys. The data files are network-first, because a cached opportunity is a dated one: if the
 * network answers we take it, and if it does not we fall back to the cache, where the app's own
 * freshness receipt then shows the real LAST CHECKED date rather than hiding the gap.
 *
 * Nothing personal passes through here. Notes, applications and the wall live in IndexedDB and are
 * never fetched, so they are never cached and never leave the device.
 */

const VERSION = 'v1';
const SHELL = `arcade-shell-${VERSION}`;
const DATA = `arcade-data-${VERSION}`;

const SHELL_FILES = [
  './', './index.html', './calibrate.html', './manifest.webmanifest',
  './src/tokens.css', './src/pixel.css', './src/app.css', './src/card.css',
  './src/pages2.css', './src/stage5.css', './src/room.css', './src/menu.css',
  './src/apps.css', './src/hacks2.css', './src/notes2.css',
  './src/main.js', './src/u.js', './src/store.js', './src/model.js', './src/sound.js',
  './src/sprites.js', './src/geo.js', './src/receipt.js', './src/desk.js', './src/wall.js',
  './src/pages/menu.js', './src/pages/feed.js', './src/pages/jobs.js', './src/pages/hacks.js',
  './src/pages/news.js', './src/pages/more.js', './src/pages/notes.js',
  './src/pages/calendar.js', './src/pages/apps.js', './src/pages/options.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // One miss must not fail the whole install, or a single renamed file breaks offline entirely.
    await Promise.allSettled(SHELL_FILES.map(f => c.add(f)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith('arcade-') && k !== SHELL && k !== DATA) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // fonts and anything else: straight through

  // Data: network first, cache only as a fallback, so a stale row is never presented as fresh.
  if (url.pathname.includes('/data/')) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(DATA)).put(req, res.clone());
        return res;
      } catch {
        const hit = await caches.match(req);
        if (hit) return hit;
        // Offline with nothing cached: an empty, honest payload rather than a broken page.
        return new Response(JSON.stringify({ generated: null, offline: true, items: [] }),
          { headers: { 'content-type': 'application/json' } });
      }
    })());
    return;
  }

  // Shell: cache first, refreshed in the background for next time.
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) {
      fetch(req).then(res => { if (res.ok) caches.open(SHELL).then(c => c.put(req, res)); }).catch(() => {});
      return hit;
    }
    try {
      const res = await fetch(req);
      if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
      return res;
    } catch {
      const page = await caches.match('./index.html');
      if (page && req.mode === 'navigate') return page;
      return new Response('Offline, and this file was never cached.', { status: 503 });
    }
  })());
});
