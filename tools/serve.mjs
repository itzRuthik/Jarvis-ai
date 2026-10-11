#!/usr/bin/env node
/**
 * tools/serve.mjs — zero-dependency static server that mirrors the GitHub Pages layout.
 *
 *   http://localhost:5173/         → index.html  (marketing site, repo root)
 *   http://localhost:5173/app/     → app/        (the JARVIS HUD)
 *
 * Keeping the same shape as the deployed site means every relative link behaves
 * identically in development, in production and inside the Android WebView.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

/** Map a URL path onto a file inside the repository. */
function resolveTarget(pathname) {
  const clean = decodeURIComponent(pathname.split('?')[0]);
  const rel = normalize(clean).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');

  // The repository root IS the website root, exactly like GitHub Pages.
  if (rel === '') return join(ROOT, 'index.html');
  if (rel === 'app' || rel === 'app/') return join(ROOT, 'app', 'index.html');

  return [join(ROOT, rel), join(ROOT, 'app', rel)];
}

async function tryFiles(candidates) {
  const list = Array.isArray(candidates) ? candidates : [candidates];
  for (const candidate of list) {
    try {
      const info = await stat(candidate);
      if (info.isDirectory()) {
        const index = join(candidate, 'index.html');
        const idx = await stat(index).catch(() => null);
        if (idx?.isFile()) return index;
        continue;
      }
      if (info.isFile()) return candidate;
    } catch { /* try the next candidate */ }
  }
  return null;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const file = await tryFiles(resolveTarget(url.pathname));

  if (!file) {
    const notFound = await readFile(join(ROOT, '404.html')).catch(() => null);
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(notFound || '<h1>404 — not found</h1>');
    return;
  }

  try {
    const body = await readFile(file);
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      // Development: never let a stale shell hide your changes.
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`500 — ${err.message}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  JARVIS AI dev server\n`);
  console.log(`  Website  →  http://localhost:${PORT}/`);
  console.log(`  Web app  →  http://localhost:${PORT}/app/`);
  console.log(`\n  Serving ${ROOT}\n  Press Ctrl+C to stop.\n`);
});
