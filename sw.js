// Solblikk service worker – app-skall offline, kartfliser lagret for bruk uten nett.
const VERSION = '0.2.3';
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
  // cache: 'reload' – hent alltid ferske filer fra serveren, ikke nettleserens mellomlager.
  e.waitUntil(caches.open(SHELL)
    .then((c) => c.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k.startsWith('solblikk-shell-') && k !== SHELL).map((k) => caches.delete(k)),
  )).then(() => self.clients.claim()));
});

let trimming = false;
async function trimTiles() {
  if (trimming) return;
  trimming = true;
  try {
    const c = await caches.open(TILES);
    const keys = await c.keys();
    for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
  } finally { trimming = false; }
}

// Kartbildene hentes som vanlige <img>, og svaret kan da ikke leses eller lagres.
// Vi ber derfor selv om flisen med CORS. Tillater Kartverket ikke det, faller vi tilbake
// til vanlig henting (kartet virker, men flisene lagres ikke) og slutter å prøve CORS.
let tilesCors = true;
async function tile(request) {
  const c = await caches.open(TILES);
  const hit = await c.match(request.url);
  if (hit) return hit;
  if (tilesCors) {
    try {
      const res = await fetch(request.url, { mode: 'cors', credentials: 'omit' });
      if (res.ok) { c.put(request.url, res.clone()).then(trimTiles).catch(() => {}); return res; }
      if (res.status === 404) return res;
    } catch { tilesCors = false; }
  }
  return fetch(request);
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Høydedata: alltid nett (appen lagrer ferdig horisont selv)
  if (url.hostname === 'ws.geonorge.no') return;

  if (url.hostname === 'cache.kartverket.no') { e.respondWith(tile(e.request)); return; }

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

  // App-skall: nett først, alltid sjekket mot serveren (no-cache), så nye versjoner aldri
  // blandes med gamle filer fra nettleserens mellomlager. Uten nett: lagret kopi.
  const sameOrigin = url.origin === location.origin;
  const req = sameOrigin ? new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : e.request;
  e.respondWith(fetch(req).then((res) => {
    if (res.ok && (sameOrigin || url.hostname === 'unpkg.com')) {
      const copy = res.clone();
      caches.open(SHELL).then((c) => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
