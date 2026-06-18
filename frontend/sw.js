'use strict';

const CACHE = 'meital-v3';

// Resolve all precache URLs relative to this SW file so the same code works
// for root deployment (https://domain.com/sw.js) and GitHub Pages subdirectory
// (https://user.github.io/repo/frontend/sw.js).
const _base = new URL('./', self.location.href).href;

const PRECACHE = [
  _base,
  _base + 'index.html',
  _base + 'admin.html',
  _base + 'manifest.json',
  _base + 'styles/tailwind.css',
  _base + 'booking.js',
  _base + 'config.js',
  _base + 'site-config-client.js',
  _base + 'theme-presets.js',
  _base + 'styles/theme-effects.css',
  _base + 'service-library.json',
  _base + 'admin.js',
  _base + 'admin-render.js',
  _base + 'admin-calendar.js',
  _base + 'admin-sheet.js',
  _base + 'admin-gestures.js',
  _base + 'meital_profile_header.webp',
  _base + 'meital_profile_header.png',
  _base + 'favicon.svg',
];

// Install: pre-cache all static assets
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

// Activate: evict any stale caches from old SW versions
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//   Cross-origin (GAS, Supabase, esm.sh CDN): network-only — never intercept
//   Navigation requests: network-first, fall back to cached shell
//   Same-origin static assets: cache-first, update cache after serving
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Cross-origin: let the browser (and Playwright mocks) handle it
  if (url.origin !== self.location.origin) return;

  // Navigation (HTML pages): network-first with offline fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
          return r;
        })
        .catch(() =>
          caches.match(e.request).then(r => r || caches.match(_base + 'index.html'))
        )
    );
    return;
  }

  // Static assets: cache-first, lazy update on cache-miss
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r.ok) {
          const clone = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return r;
      });
    })
  );
});
