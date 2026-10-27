// Solblikk service worker – app-skall offline, kartfliser hurtiglagret.
const VERSION = '0.2.1';
const SHELL = `solblikk-shell-${VERSION}`;
const TILES = 'solblikk-tiles';
const MAX_TILES = 1500;

const SHELL_FILES = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/version.js', 'js/sun.js', 'js/horizon.js', 'js/projection.js', 'js/format.js',
  'js/mapgeo.js', 'js/map-view.js', 'js/camera-view.js', 'js/rotation.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet-rotate@0.5.0/dist/leaflet-rotate.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('solblikk-shell-') && k !== SHELL).map((k) => caches.delete(k)),
  )).then(() => self.clients.claim()));
});

async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Høydedata: alltid nett (appen lagrer ferdig horisont selv)
  if (url.hostname === 'ws.geonorge.no') return;

  // Kartfliser: cache først, nett ved behov
  if (url.hostname === 'cache.kartverket.no') {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) { c.put(e.request, res.clone()); trimTiles(); }
      return res;
    }));
    return;
  }

  // Skrifter: cache først
  if (url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(caches.open(SHELL).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }

  // App-skall: nett først (nye versjoner slår inn), cache ved offline
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && (url.origin === location.origin || url.hostname === 'unpkg.com')) {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
