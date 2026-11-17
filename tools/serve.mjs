/* A static server with no dependencies, so `npm run dev` works offline and on a fresh clone.
   file:// cannot load ES modules, which is the whole reason this exists. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 5173);
const ROOT = process.cwd();
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  // never serve anything outside the project, whatever the URL tries
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found: ' + rel); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log(`Career Arcade on http://localhost:${PORT}/`);
  console.log(`calibration page:  http://localhost:${PORT}/calibrate.html`);
});
