/**
 * sw.js — service worker: app-shell caching so JARVIS opens instantly and works offline.
 * Bump CACHE_VERSION on every release to invalidate old shells.
 */

const CACHE_VERSION = 'jarvis-shell-v1.1.0';

const SHELL = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon.ico',
  './js/main.js',
  './js/config.js',
  './js/util.js',
  './js/store.js',
  './js/tools.js',
  './js/search.js',
  './js/providers.js',
  './js/local-core.js',
  './js/brain.js',
  './js/docs.js',
  './js/voice.js',
  './js/core-canvas.js',
  './js/ui.js'
];

const isApiCall = (url) =>
  /generativelanguage\.googleapis\.com|api\.openai\.com|api\.anthropic\.com|openrouter\.ai|api\.groq\.com|tavily\.com|brave\.com|serper\.dev|wikipedia\.org/.test(url.host);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await Promise.allSettled(SHELL.map((asset) => cache.add(new Request(asset, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (isApiCall(url)) return; // never cache model or search traffic

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_VERSION);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_VERSION);
        return (await cache.match('./index.html')) || (await cache.match('./')) ||
          new Response('<h1>JARVIS offline</h1><p>Open once with a network connection to install the app shell.</p>', { headers: { 'Content-Type': 'text/html' } });
      }
    })());
    return;
  }

  if (url.origin !== location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    const network = fetch(request)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') cache.put(request, res.clone());
        return res;
      })
      .catch(() => null);
    return cached || (await network) || new Response('', { status: 504 });
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
